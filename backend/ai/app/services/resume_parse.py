"""简历解析 service（T-021）。

编排：下载文件 → 抽文本+页数 → LLM 结构化抽取 → Pydantic 校验 → 回调 Spring Boot。

异步语义：service.parse_resume 由 FastAPI BackgroundTasks 派发；
所有错误都被捕获并走 failed 回调，执行结束后关闭任务专属客户端。
"""

from __future__ import annotations

import io
import json
import logging
from typing import Any

import httpx
from docx import Document
from pypdf import PdfReader
from pypdf.errors import PdfReadError

from app.clients.business import BusinessCallbackClient
from app.clients.llm import LlmClient
from app.prompts.resume_parse import (
    ERROR_DOWNLOAD,
    ERROR_EMPTY_TEXT,
    ERROR_EXTRACT_DOCX,
    ERROR_EXTRACT_PDF,
    ERROR_FILE_TOO_LARGE,
    ERROR_LLM_CALL,
    ERROR_LLM_INVALID_JSON,
    ERROR_LLM_SCHEMA_INVALID,
    ERROR_PAGE_COUNT,
    ERROR_UNSUPPORTED_MIME,
    SYSTEM_PROMPT,
    build_user_prompt,
)
from app.schemas.resume import ParsedResume

logger = logging.getLogger("miraprep.ai.resume_parse")

# 文件大小上限（10MB），防止超大文件拖垮服务
MAX_FILE_BYTES = 10 * 1024 * 1024
# LLM 输入截断：避免过长简历超出 token 上限
MAX_TEXT_CHARS = 8000
# DOCX 未保存渲染后页数时的保守估算值；显式分页符优先。
DOCX_ESTIMATED_CHARS_PER_PAGE = 2000

PDF_MIME = "application/pdf"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


class ResumeParseService:
    """简历解析服务：依赖注入 LlmClient + BusinessCallbackClient，方便测试 mock。"""

    def __init__(
        self,
        llm: LlmClient,
        callback: BusinessCallbackClient,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._llm = llm
        self._callback = callback
        self._http_client = http_client or httpx.AsyncClient(timeout=30.0)
        self._owns_http = http_client is None

    async def aclose(self) -> None:
        closers = []
        if self._owns_http:
            closers.append(self._http_client.aclose)
        closers.extend((self._callback.aclose, self._llm.aclose))
        for close in closers:
            try:
                await close()
            except Exception:
                logger.exception("resume parse client close failed")

    async def parse_resume(
        self, resume_id: int, signed_url: str, file_name: str, mime_type: str
    ) -> None:
        """主流程。所有失败分支均走 failed 回调，不抛异常。"""

        try:
            # 1. 下载
            try:
                content = await self._download(signed_url)
            except _FileTooLargeError:
                await self._fail(resume_id, ERROR_FILE_TOO_LARGE)
                return
            except Exception as exc:
                logger.warning(
                    "resume download failed", extra={"resume_id": resume_id, "error": str(exc)}
                )
                await self._fail(resume_id, ERROR_DOWNLOAD)
                return

            # 2. 抽文本 + 页数
            try:
                text, page_count = self._extract(content, mime_type)
            except _UnsupportedMimeError:
                await self._fail(resume_id, ERROR_UNSUPPORTED_MIME)
                return
            except Exception as exc:
                logger.warning(
                    "resume extract failed", extra={"resume_id": resume_id, "error": str(exc)}
                )
                err = ERROR_EXTRACT_PDF if mime_type == PDF_MIME else ERROR_EXTRACT_DOCX
                # 加密 PDF 也会被 pypdf 抛出，统一归到 pdf 抽取失败
                await self._fail(resume_id, err)
                return

            if not text.strip():
                await self._fail(resume_id, ERROR_EMPTY_TEXT)
                return

            # 3. LLM 结构化抽取
            truncated = text[:MAX_TEXT_CHARS]
            try:
                raw = await self._llm.complete(
                    messages=[{"role": "user", "content": build_user_prompt(truncated)}],
                    system=SYSTEM_PROMPT,
                )
            except Exception:
                logger.exception("llm call failed", extra={"resume_id": resume_id})
                await self._fail(resume_id, ERROR_LLM_CALL)
                return

            # 4. Pydantic 校验
            try:
                parsed = self._validate(raw, text)
            except _InvalidJsonError:
                await self._fail(resume_id, ERROR_LLM_INVALID_JSON)
                return
            except _SchemaInvalidError:
                await self._fail(resume_id, ERROR_LLM_SCHEMA_INVALID)
                return

            # 5. 成功回调
            await self._succeed(resume_id, parsed, page_count)
        except Exception:
            # 最后一道保险：任何没料到的异常都走 failed，不让后台任务崩
            logger.exception("resume parse unexpected failure", extra={"resume_id": resume_id})
            await self._fail(resume_id, "unexpected internal error")
        finally:
            await self.aclose()

    async def _download(self, signed_url: str) -> bytes:
        """流式下载文件，在分配完整响应体前执行大小限制。"""

        async with self._http_client.stream("GET", signed_url) as response:
            response.raise_for_status()
            content_length = response.headers.get("content-length")
            if content_length and int(content_length) > MAX_FILE_BYTES:
                raise _FileTooLargeError()

            chunks: list[bytes] = []
            total_bytes = 0
            async for chunk in response.aiter_bytes():
                total_bytes += len(chunk)
                if total_bytes > MAX_FILE_BYTES:
                    raise _FileTooLargeError()
                chunks.append(chunk)
        return b"".join(chunks)

    def _extract(self, content: bytes, mime_type: str) -> tuple[str, int]:
        """根据 mime 走对应抽取器，返回 (文本, 页数)。"""

        if mime_type == PDF_MIME:
            return self._extract_pdf(content)
        if mime_type == DOCX_MIME:
            return self._extract_docx(content)
        raise _UnsupportedMimeError()

    @staticmethod
    def _extract_pdf(content: bytes) -> tuple[str, int]:
        try:
            reader = PdfReader(io.BytesIO(content))
        except PdfReadError as exc:
            # 加密 / 损坏
            raise PdfReadError(f"unreadable pdf: {exc}") from exc
        parts: list[str] = []
        for page in reader.pages:
            try:
                parts.append(page.extract_text() or "")
            except Exception:
                # 单页失败不致命，继续
                parts.append("")
        text = "\n".join(parts)
        try:
            page_count = len(reader.pages)
        except Exception as exc:  # pragma: no cover - 极少数情况
            raise RuntimeError(ERROR_PAGE_COUNT) from exc
        return text, page_count

    @staticmethod
    def _extract_docx(content: bytes) -> tuple[str, int]:
        # DOCX 本身不保存渲染后的总页数。优先识别作者插入的显式分页符；
        # 没有分页符时，再用字符数做保底估算。
        document = Document(io.BytesIO(content))
        parts = [p.text for p in document.paragraphs if p.text]
        # 表格里的文字也要抽出来
        for table in document.tables:
            for row in table.rows:
                for cell in row.cells:
                    if cell.text:
                        parts.append(cell.text)
        text = "\n".join(parts)
        explicit_page_breaks = len(document.element.body.xpath(".//w:br[@w:type='page']"))
        estimated_pages = max(
            1, (len(text) + DOCX_ESTIMATED_CHARS_PER_PAGE - 1) // DOCX_ESTIMATED_CHARS_PER_PAGE
        )
        page_count = max(explicit_page_breaks + 1, estimated_pages)
        return text, page_count

    def _validate(self, raw_llm_output: str, original_text: str) -> ParsedResume:
        """解析 LLM 输出为 ParsedResume；失败抛 _InvalidJsonError / _SchemaInvalidError。"""

        # 模型偶尔会包 markdown 代码块，做一次清洗
        cleaned = raw_llm_output.strip()
        if cleaned.startswith("```"):
            # 去掉首尾的 ```json / ```
            cleaned = cleaned.strip("`")
            if cleaned.lower().startswith("json"):
                cleaned = cleaned[4:]
            cleaned = cleaned.strip()
        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            logger.warning(
                "llm returned non-json", extra={"error": str(exc), "raw": raw_llm_output[:200]}
            )
            raise _InvalidJsonError() from exc
        try:
            parsed = ParsedResume.model_validate(data)
        except Exception as exc:
            logger.warning("llm output schema invalid", extra={"error": str(exc)})
            raise _SchemaInvalidError() from exc
        # 强制把 raw_text_excerpt 设成原文前 500 字，避免 LLM 自己瞎编
        parsed.raw_text_excerpt = original_text[:500]
        return parsed

    async def _succeed(self, resume_id: int, parsed: ParsedResume, page_count: int) -> None:
        body: dict[str, Any] = {
            "status": "success",
            "parsedJson": parsed.model_dump(),
            "pageCount": page_count,
        }
        delivered = await self._callback.callback(
            path=f"/resumes/{resume_id}/parse-result", json=body
        )
        if not delivered:
            # 回调失败已被 BusinessCallbackClient 重试 3 次；这里只记日志
            logger.error("callback delivery failed after retries", extra={"resume_id": resume_id})

    async def _fail(self, resume_id: int, error: str) -> None:
        body: dict[str, Any] = {"status": "failed", "error": error}
        delivered = await self._callback.callback(
            path=f"/resumes/{resume_id}/parse-result", json=body
        )
        if not delivered:
            logger.error("callback delivery failed after retries", extra={"resume_id": resume_id})


class _UnsupportedMimeError(Exception):
    """mime 不在支持列表里。"""


class _FileTooLargeError(Exception):
    """下载内容超过解析服务允许的最大大小。"""


class _InvalidJsonError(Exception):
    """LLM 输出不是合法 JSON。"""


class _SchemaInvalidError(Exception):
    """LLM 输出不符合 ParsedResume schema。"""
