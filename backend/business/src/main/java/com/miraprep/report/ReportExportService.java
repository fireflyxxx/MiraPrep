package com.miraprep.report;

import com.miraprep.common.error.ErrorCode;
import com.miraprep.common.exception.BusinessException;
import com.miraprep.report.dto.GradeResultRequest;
import com.miraprep.report.dto.ReportResponse;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.springframework.stereotype.Service;

/**
 * 把报告数据渲染成 PDF。
 *
 * <p>选型：直接用 PDFBox 画，而不是「HTML 模板 → PDF」。原因有二：报告里的五维雷达图用
 * HTML/CSS 画不出来（得再拖进 SVG 渲染引擎），而 PDFBox 画多边形只要几行；另外少一层模板
 * 引擎就少一层依赖。代价是排版要自己算坐标，见 {@link Canvas}。
 *
 * <p>中文字体必须内嵌进 PDF，否则阅读器上是一片方块。字体文件随 jar 一起发布，PDFBox 只把
 * 用到的那些字形子集嵌进去，所以成品 PDF 只有几十 KB。
 */
@Service
public class ReportExportService {
    private static final String FONT_RESOURCE = "/fonts/NotoSansSC-Regular.ttf";
    private static final DateTimeFormatter DATE =
            DateTimeFormatter.ofPattern("yyyy.MM.dd").withZone(ZoneId.systemDefault());

    private static final float MARGIN = 48f;
    private static final float CONTENT_WIDTH = PDRectangle.A4.getWidth() - 2 * MARGIN;

    private static final float[] INK = rgb(0x0a, 0x0a, 0x0a);
    private static final float[] MUTED = rgb(0x73, 0x73, 0x73);
    private static final float[] PRIMARY = rgb(0xf9, 0x73, 0x16);
    private static final float[] BORDER = rgb(0xe5, 0xe5, 0xe5);

    /** 中文排版规矩：这些标点不能出现在一行的开头。 */
    private static final String NO_LINE_START = "，。、；：？！）】》」』””’%…·—";

    private static final List<Map.Entry<String, java.util.function.ToIntFunction<
                    GradeResultRequest.DimensionScores>>>
            DIMENSIONS = List.of(
                    Map.entry("专业知识", GradeResultRequest.DimensionScores::professionalKnowledge),
                    Map.entry("项目深度", GradeResultRequest.DimensionScores::projectDepth),
                    Map.entry("表达逻辑", GradeResultRequest.DimensionScores::communicationLogic),
                    Map.entry("临场应变", GradeResultRequest.DimensionScores::adaptability),
                    Map.entry("岗位匹配", GradeResultRequest.DimensionScores::jobFit));

    private final ReportService reportService;
    private final byte[] fontBytes;

    public ReportExportService(ReportService reportService) {
        this.reportService = reportService;
        this.fontBytes = readFont();
    }

    /** 归属校验和 404 直接复用报告查询，导出和页面看到的是同一份数据。 */
    public byte[] export(Long userId, Long sessionId) {
        ReportResponse report = reportService.get(userId, sessionId);
        try (PDDocument document = new PDDocument()) {
            Canvas canvas = new Canvas(document, PDType0Font.load(
                    document, new java.io.ByteArrayInputStream(fontBytes), true));
            render(canvas, report);
            canvas.close();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new BusinessException(ErrorCode.INTERNAL);
        }
    }

    /** 导出文件名，前端拿 Content-Disposition 里的这个名字落盘。 */
    public String fileName(Long sessionId) {
        return "MiraPrep-report-" + sessionId + ".pdf";
    }

    private void render(Canvas canvas, ReportResponse report) throws IOException {
        canvas.text("MIRAPREP · INTERVIEW REPORT " + DATE.format(report.createdAt()), 9, MUTED);
        canvas.gap(6);
        canvas.text(nullToEmpty(report.jobTitle()) + " 面试报告", 20, INK);
        canvas.gap(4);
        canvas.text(metaLine(report), 9.5f, MUTED);
        canvas.gap(14);

        canvas.text(
                "综合评级 " + report.grade() + "     总分 " + number(report.totalScore()) + " / 100",
                15,
                PRIMARY);
        canvas.gap(12);

        if (report.dimensionScores() != null) {
            canvas.radar(report.dimensionScores());
            canvas.gap(12);
        }

        canvas.heading("总体评语");
        canvas.text(nullToEmpty(report.summary()), 10.5f, INK);
        canvas.gap(12);

        canvas.heading("表现亮点");
        canvas.bullets(report.highlights());
        canvas.gap(10);
        canvas.heading("提升方向");
        canvas.bullets(report.weaknesses());
        canvas.gap(14);

        canvas.heading("逐题复盘（共 " + report.questions().size() + " 题）");
        for (ReportResponse.Question question : report.questions()) {
            renderQuestion(canvas, question);
        }
    }

    private void renderQuestion(Canvas canvas, ReportResponse.Question question) throws IOException {
        canvas.gap(6);
        canvas.rule();
        canvas.gap(8);
        String score = question.score() == null ? "未评分" : number(question.score()) + "/10";
        canvas.text("Q" + question.order() + "  " + nullToEmpty(question.text()), 11.5f, INK);
        canvas.gap(3);
        canvas.text("得分 " + score + tags(question), 9, MUTED);
        canvas.gap(8);

        canvas.label("你的回答");
        canvas.text(blankToPlaceholder(question.answer(), "本题没有记录到回答"), 10, INK);
        canvas.gap(6);
        canvas.label("参考答案要点");
        canvas.text(blankToPlaceholder(question.referenceAnswer(), "暂无参考答案"), 10, INK);

        List<String> followUps = followUpLines(question.followUpChain());
        if (!followUps.isEmpty()) {
            canvas.gap(6);
            canvas.label("追问链");
            canvas.bullets(followUps);
        }

        canvas.gap(6);
        canvas.label("建议");
        canvas.text(
                question.suggestions().isEmpty()
                        ? "继续保持当前答题节奏。"
                        : String.join("；", question.suggestions()),
                10,
                INK);
        canvas.gap(8);
    }

    private List<String> followUpLines(List<Object> chain) {
        List<String> lines = new ArrayList<>();
        for (Object item : chain) {
            if (item instanceof Map<?, ?> map) {
                lines.add("追问：" + string(map.get("question")) + "  你的回答：" + string(map.get("answer")));
            }
        }
        return lines;
    }

    private String metaLine(ReportResponse report) {
        ReportResponse.Config config = report.config();
        StringBuilder line = new StringBuilder();
        if (config != null) {
            line.append(nullToEmpty(config.jobDirection()))
                    .append(" · ")
                    .append(nullToEmpty(config.difficulty()))
                    .append(" · ")
                    .append(config.durationMin())
                    .append(" 分钟 · ");
        }
        line.append(report.questions().size()).append(" 道题目");
        if (report.partial()) {
            line.append(" · 部分完成");
        }
        return line.toString();
    }

    private String tags(ReportResponse.Question question) {
        StringBuilder tags = new StringBuilder();
        if (question.phase() != null) {
            tags.append("  ·  阶段 ").append(question.phase());
        }
        if (!question.focusPoints().isEmpty()) {
            tags.append("  ·  考察点 ").append(String.join("、", question.focusPoints()));
        }
        return tags.toString();
    }

    /** MySQL 的 DECIMAL 列取出来带小数位（84.00），报告里要显示成 84。 */
    private static String number(BigDecimal value) {
        return value.stripTrailingZeros().toPlainString();
    }

    private static String string(Object value) {
        return value == null ? "" : value.toString();
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private static String blankToPlaceholder(String value, String placeholder) {
        return value == null || value.isBlank() ? placeholder : value;
    }

    private static float[] rgb(int r, int g, int b) {
        return new float[] {r / 255f, g / 255f, b / 255f};
    }

    private byte[] readFont() {
        try (InputStream input = ReportExportService.class.getResourceAsStream(FONT_RESOURCE)) {
            if (input == null) {
                throw new IllegalStateException("缺少内嵌中文字体 " + FONT_RESOURCE);
            }
            return input.readAllBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /**
     * 一支「会自己换行、自己翻页」的笔：只往下走，写满一页就开新的一页。
     *
     * <p>ponytail: 单向流式排版，没有分栏也没有跨页表格；报告是一条从上到下的长文档，够用。
     */
    private static final class Canvas {
        private final PDDocument document;
        private final PDType0Font font;
        private PDPageContentStream stream;
        private float y;

        Canvas(PDDocument document, PDType0Font font) throws IOException {
            this.document = document;
            this.font = font;
            newPage();
        }

        void close() throws IOException {
            stream.close();
        }

        private void newPage() throws IOException {
            if (stream != null) {
                stream.close();
            }
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            stream = new PDPageContentStream(document, page);
            y = PDRectangle.A4.getHeight() - MARGIN;
        }

        /** 剩余高度不够就翻页，避免一行字被切在页脚。 */
        private void ensure(float needed) throws IOException {
            if (y - needed < MARGIN) {
                newPage();
            }
        }

        void gap(float height) {
            y -= height;
        }

        void heading(String text) throws IOException {
            gap(4);
            text(text, 12.5f, PRIMARY);
            gap(4);
        }

        void label(String text) throws IOException {
            text(text, 8.5f, MUTED);
            gap(1);
        }

        void bullets(List<String> items) throws IOException {
            if (items.isEmpty()) {
                text("暂无内容", 10, MUTED);
                return;
            }
            for (String item : items) {
                text("· " + item, 10, INK);
            }
        }

        void text(String raw, float size, float[] color) throws IOException {
            float lineHeight = size * 1.5f;
            for (String line : wrap(raw, size, CONTENT_WIDTH)) {
                ensure(lineHeight);
                stream.beginText();
                stream.setNonStrokingColor(color[0], color[1], color[2]);
                stream.setFont(font, size);
                stream.newLineAtOffset(MARGIN, y - size);
                stream.showText(line);
                stream.endText();
                y -= lineHeight;
            }
        }

        void rule() throws IOException {
            ensure(1);
            stream.setStrokingColor(BORDER[0], BORDER[1], BORDER[2]);
            stream.setLineWidth(0.6f);
            stream.moveTo(MARGIN, y);
            stream.lineTo(MARGIN + CONTENT_WIDTH, y);
            stream.stroke();
        }

        /** 五维雷达图：正五边形网格 + 得分多边形，纯几何计算，不依赖任何图表库。 */
        void radar(GradeResultRequest.DimensionScores scores) throws IOException {
            float radius = 78f;
            float diameter = 2 * radius + 46f;
            ensure(diameter);
            float cx = MARGIN + CONTENT_WIDTH / 2;
            float cy = y - radius - 16f;

            stream.setStrokingColor(BORDER[0], BORDER[1], BORDER[2]);
            stream.setLineWidth(0.5f);
            for (float ring : new float[] {0.25f, 0.5f, 0.75f, 1f}) {
                polygon(cx, cy, radius * ring);
                stream.stroke();
            }
            for (int i = 0; i < DIMENSIONS.size(); i++) {
                stream.moveTo(cx, cy);
                stream.lineTo(vertexX(cx, radius, i), vertexY(cy, radius, i));
                stream.stroke();
            }

            stream.setStrokingColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
            stream.setNonStrokingColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
            stream.setLineWidth(1.2f);
            for (int i = 0; i < DIMENSIONS.size(); i++) {
                float ratio = clamp(DIMENSIONS.get(i).getValue().applyAsInt(scores) / 100f);
                float px = vertexX(cx, radius * ratio, i);
                float py = vertexY(cy, radius * ratio, i);
                if (i == 0) {
                    stream.moveTo(px, py);
                } else {
                    stream.lineTo(px, py);
                }
            }
            stream.closeAndStroke();

            for (int i = 0; i < DIMENSIONS.size(); i++) {
                var dimension = DIMENSIONS.get(i);
                String caption = dimension.getKey() + " " + dimension.getValue().applyAsInt(scores);
                float labelRadius = radius + 12f;
                float lx = vertexX(cx, labelRadius, i);
                float ly = vertexY(cy, labelRadius, i);
                float width = width(caption, 8.5f);
                stream.beginText();
                stream.setNonStrokingColor(MUTED[0], MUTED[1], MUTED[2]);
                stream.setFont(font, 8.5f);
                // 正上方的标签居中，左半边的标签整体左移，否则文字会压到图上。
                float tx = i == 0 ? lx - width / 2 : lx < cx ? lx - width - 4 : lx + 4;
                stream.newLineAtOffset(tx, ly - (i == 0 ? 0 : 4));
                stream.showText(caption);
                stream.endText();
            }
            y = cy - radius - 22f;
        }

        private void polygon(float cx, float cy, float radius) throws IOException {
            stream.moveTo(vertexX(cx, radius, 0), vertexY(cy, radius, 0));
            for (int i = 1; i < DIMENSIONS.size(); i++) {
                stream.lineTo(vertexX(cx, radius, i), vertexY(cy, radius, i));
            }
            stream.closePath();
        }

        private float vertexX(float cx, float radius, int index) {
            return cx + radius * (float) Math.cos(angle(index));
        }

        private float vertexY(float cy, float radius, int index) {
            return cy + radius * (float) Math.sin(angle(index));
        }

        /** 从正上方开始，顺时针均分一圈。 */
        private double angle(int index) {
            return Math.PI / 2 - 2 * Math.PI * index / DIMENSIONS.size();
        }

        private float clamp(float ratio) {
            return Math.max(0f, Math.min(1f, ratio));
        }

        /**
         * 按可用宽度断行。中文可以任意位置断，所以逐字累加宽度即可。
         *
         * <p>ponytail: 英文长单词会被从中间切断；报告正文以中文为主，先不做西文断词。
         */
        private List<String> wrap(String raw, float size, float maxWidth) throws IOException {
            List<String> lines = new ArrayList<>();
            StringBuilder current = new StringBuilder();
            float width = 0;
            for (int i = 0; i < raw.length(); ) {
                int codePoint = raw.codePointAt(i);
                i += Character.charCount(codePoint);
                if (codePoint == '\n') {
                    lines.add(current.toString());
                    current.setLength(0);
                    width = 0;
                    continue;
                }
                String glyph = safeGlyph(codePoint);
                if (glyph.isEmpty()) {
                    continue;
                }
                float glyphWidth = width(glyph, size);
                // 避头尾：标点不能被挤到下一行开头，宁可让它稍微出界。
                boolean breakable = NO_LINE_START.indexOf(codePoint) < 0;
                if (breakable && width + glyphWidth > maxWidth && current.length() > 0) {
                    lines.add(current.toString());
                    current.setLength(0);
                    width = 0;
                }
                current.append(glyph);
                width += glyphWidth;
            }
            if (current.length() > 0 || lines.isEmpty()) {
                lines.add(current.toString());
            }
            return lines;
        }

        /**
         * 字体里没有的字符（emoji、生僻字、控制字符）会让 PDFBox 直接抛异常，导出整个失败。
         * 这里先探一次，探不过就换成占位方块，宁可缺一个字也不能让下载 500。
         */
        private String safeGlyph(int codePoint) {
            if (Character.isISOControl(codePoint)) {
                return codePoint == '\t' ? "    " : "";
            }
            String glyph = new String(Character.toChars(codePoint));
            try {
                font.getStringWidth(glyph);
                return glyph;
            } catch (IOException | IllegalArgumentException e) {
                return "□";
            }
        }

        private float width(String text, float size) throws IOException {
            return font.getStringWidth(text) / 1000 * size;
        }
    }
}
