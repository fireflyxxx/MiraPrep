package com.miraprep.report;

import com.miraprep.common.error.ErrorCode;
import com.miraprep.common.exception.BusinessException;
import com.miraprep.domain.InterviewSession;
import com.miraprep.domain.Report;
import com.miraprep.domain.Resume;
import com.miraprep.report.dto.ReportResponse;
import com.miraprep.report.dto.ShareResponse;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 报告分享链接。
 *
 * <p>安全模型很简单：链接本身就是凭证（能拿到 token 就能看），所以 token 必须是密码学随机、
 * 长到猜不出来的，而且公开视图里绝不能出现任何能定位到本人的信息。
 *
 * <p>「关闭分享」不是打个标记，而是直接把 token 置空。再次开启会生成一个全新的 token，
 * 老链接永久失效——这样「撤回」才是真的撤回。
 */
@Service
public class ShareService {
    /** 24 字节随机数 → 32 个 URL 安全字符，暴力猜解不现实。 */
    private static final int TOKEN_BYTES = 24;
    private static final SecureRandom RANDOM = new SecureRandom();

    private static final Pattern EMAIL =
            Pattern.compile("[\\w.+-]+@[\\w-]+\\.[\\w.-]+");
    private static final Pattern CHINA_MOBILE = Pattern.compile("(?<!\\d)1[3-9]\\d{9}(?!\\d)");
    private static final Pattern ID_CARD =
            Pattern.compile("(?<!\\d)\\d{17}[\\dXx](?!\\d)");
    private static final String MASK = "[已隐藏]";

    private final ReportRepository reportRepository;
    private final ReportService reportService;
    private final String shareBaseUrl;

    public ShareService(
            ReportRepository reportRepository,
            ReportService reportService,
            @Value("${app.share.base-url:http://localhost:3000}") String shareBaseUrl) {
        this.reportRepository = reportRepository;
        this.reportService = reportService;
        this.shareBaseUrl = shareBaseUrl.replaceAll("/+$", "");
    }

    @Transactional
    public ShareResponse setShared(Long userId, Long sessionId, boolean enabled) {
        Report report = ownedReport(userId, sessionId);
        if (!enabled) {
            report.setShareToken(null);
            report.setSharedAt(null);
            return new ShareResponse(false, null, null);
        }
        if (report.getShareToken() == null) {
            report.setShareToken(newToken());
            report.setSharedAt(Instant.now());
        }
        return new ShareResponse(true, report.getShareToken(), shareUrl(report.getShareToken()));
    }

    @Transactional(readOnly = true)
    public ShareResponse status(Long userId, Long sessionId) {
        Report report = ownedReport(userId, sessionId);
        String token = report.getShareToken();
        return new ShareResponse(token != null, token, token == null ? null : shareUrl(token));
    }

    /**
     * 公开只读视图。注意这里**没有** userId 参数——调用方是匿名的，token 就是全部凭证。
     */
    @Transactional(readOnly = true)
    public ReportResponse publicReport(String shareToken) {
        Report report = reportRepository
                .findByShareToken(shareToken)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        InterviewSession session = report.getSession();
        if (session.isDeleted()) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        // 报告组装逻辑只有一份：这里以「报告主人的身份」取出完整视图，再整体脱敏。
        // 归属校验因此必然通过——token 已经代替它做完了授权判断。
        ReportResponse full = reportService.get(session.getUser().getId(), session.getId());
        return redact(full, session);
    }

    private Report ownedReport(Long userId, Long sessionId) {
        Report report = reportRepository
                .findBySessionId(sessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        InterviewSession session = report.getSession();
        if (session.isDeleted()) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        if (!session.getUser().getId().equals(userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        return report;
    }

    private String newToken() {
        byte[] bytes = new byte[TOKEN_BYTES];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String shareUrl(String token) {
        return shareBaseUrl + "/public/reports/" + token;
    }

    /**
     * 脱敏。分三层：
     *
     * <ol>
     *   <li>整块丢弃只对本人有意义、又最容易夹带隐私的字段：签名音频地址、JD 原文、自定义要求。
     *   <li>把本人的已知身份（账号邮箱、昵称、简历里解析出来的姓名/邮箱/电话）逐个替换掉。
     *   <li>再用通用正则兜底扫一遍邮箱、手机号、身份证号——LLM 复述候选人自我介绍时会带出来。
     * </ol>
     */
    private ReportResponse redact(ReportResponse report, InterviewSession session) {
        List<String> identities = knownIdentities(session);
        ReportResponse.Config config = report.config();
        ReportResponse.Config publicConfig = config == null
                ? null
                : new ReportResponse.Config(
                        config.jobDirection(),
                        clean(config.jobTitle(), identities),
                        null,
                        config.difficulty(),
                        config.types(),
                        config.durationMin(),
                        null,
                        config.interviewerStyle(),
                        config.voiceEnabled());

        return new ReportResponse(
                null,
                report.grade(),
                report.totalScore(),
                clean(report.jobTitle(), identities),
                report.createdAt(),
                publicConfig,
                report.dimensionScores(),
                clean(report.summary(), identities),
                cleanAll(report.highlights(), identities),
                cleanAll(report.weaknesses(), identities),
                report.partial(),
                report.questions().stream()
                        .map(question -> redactQuestion(question, identities))
                        .toList());
    }

    private ReportResponse.Question redactQuestion(
            ReportResponse.Question question, List<String> identities) {
        return new ReportResponse.Question(
                question.questionId(),
                question.order(),
                question.phase(),
                clean(question.text(), identities),
                // 考察点是大模型围绕简历生成的，会复述姓名和联系方式，和正文一样要脱敏。
                cleanAll(question.focusPoints(), identities),
                clean(question.answer(), identities),
                question.score(),
                question.thinkSeconds(),
                question.answerSeconds(),
                question.suggestedSeconds(),
                clean(question.referenceAnswer(), identities),
                cleanAll(question.suggestions(), identities),
                question.followUpChain().stream()
                        .map(item -> redactTree(item, identities))
                        .toList(),
                // 签名音频链接是私有对象的临时通行证，公开视图里必须消失。
                null);
    }

    /**
     * 追问链是大模型产出的自由 JSON，业务侧不解释它的结构，所以脱敏也不能去猜它有几层：
     * 整棵树递归下去，凡是字符串就洗一遍。只认「map 的值」和「列表的字符串元素」的写法，
     * 会在结构一变（比如列表里放 map）的时候静默漏数据。
     */
    private Object redactTree(Object node, List<String> identities) {
        if (node instanceof String text) {
            return clean(text, identities);
        }
        if (node instanceof Map<?, ?> map) {
            Map<String, Object> redacted = new LinkedHashMap<>();
            map.forEach((key, value) ->
                    redacted.put(String.valueOf(key), redactTree(value, identities)));
            return redacted;
        }
        if (node instanceof List<?> list) {
            return list.stream().map(item -> redactTree(item, identities)).toList();
        }
        return node;
    }

    /** 本人的身份串：账号邮箱、昵称，以及简历解析结果里的 basics.name / email / phone。 */
    private List<String> knownIdentities(InterviewSession session) {
        List<String> identities = new ArrayList<>();
        add(identities, session.getUser().getEmail());
        add(identities, session.getUser().getNickname());
        Resume resume = session.getResume();
        if (resume != null && resume.getParsedJson() != null) {
            Object basics = resume.getParsedJson().get("basics");
            if (basics instanceof Map<?, ?> map) {
                add(identities, string(map.get("name")));
                add(identities, string(map.get("email")));
                add(identities, string(map.get("phone")));
            }
        }
        // 先替换长的，避免「张三」先被替换掉后「张三丰」再也匹配不到。
        identities.sort((left, right) -> right.length() - left.length());
        return identities;
    }

    private void add(List<String> identities, String value) {
        // 一两个字的昵称满篇都是（比如「我」），全局替换会把正文打成马赛克。
        if (value != null && value.trim().length() >= 2) {
            identities.add(value.trim());
        }
    }

    private String string(Object value) {
        return value == null ? null : value.toString();
    }

    private List<String> cleanAll(List<String> values, List<String> identities) {
        return values == null ? List.of() : values.stream().map(v -> clean(v, identities)).toList();
    }

    private String clean(String text, List<String> identities) {
        if (text == null || text.isEmpty()) {
            return text;
        }
        String cleaned = text;
        for (String identity : identities) {
            cleaned = cleaned.replace(identity, MASK);
        }
        cleaned = EMAIL.matcher(cleaned).replaceAll(MASK);
        cleaned = ID_CARD.matcher(cleaned).replaceAll(MASK);
        cleaned = CHINA_MOBILE.matcher(cleaned).replaceAll(MASK);
        return cleaned;
    }
}
