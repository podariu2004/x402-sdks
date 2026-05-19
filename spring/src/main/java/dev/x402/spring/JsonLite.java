package dev.x402.spring;

/**
 * Minimal compact-JSON helpers — deliberately NOT a general serializer.
 *
 * <p>{@link #kv} emits one {@code "key":"value"} pair with the value escaped
 * per RFC 8259, so request bodies are built field-by-field in exact contract
 * order and the signed bytes equal the sent bytes. {@link #boolField} is a
 * best-effort reader for the platform's flat {@code {"allowed":true}} replies.
 */
final class JsonLite {

    private JsonLite() {
    }

    /** {@code "key":"value"} with the string value JSON-escaped. */
    static String kv(String key, String value) {
        return quote(key) + ":" + quote(value);
    }

    /**
     * {@code "key":<raw>} if {@code raw} is already a JSON value
     * (object/array/number/bool/null), else {@code "key":"<escaped>"}.
     */
    static String rawOrString(String key, String raw) {
        String t = raw.trim();
        boolean isJson = !t.isEmpty() && (
                t.charAt(0) == '{' || t.charAt(0) == '[' || t.charAt(0) == '"'
                || "true".equals(t) || "false".equals(t) || "null".equals(t)
                || t.matches("-?\\d+(\\.\\d+)?([eE][+-]?\\d+)?"));
        return quote(key) + ":" + (isJson ? raw : quote(raw));
    }

    static String quote(String s) {
        StringBuilder sb = new StringBuilder(s.length() + 2);
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"':
                    sb.append("\\\"");
                    break;
                case '\\':
                    sb.append("\\\\");
                    break;
                case '\n':
                    sb.append("\\n");
                    break;
                case '\r':
                    sb.append("\\r");
                    break;
                case '\t':
                    sb.append("\\t");
                    break;
                case '\b':
                    sb.append("\\b");
                    break;
                case '\f':
                    sb.append("\\f");
                    break;
                default:
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        sb.append('"');
        return sb.toString();
    }

    /**
     * Best-effort: returns true iff the JSON object string contains
     * {@code "key": true} (whitespace-tolerant). Any parse ambiguity ⇒ false
     * (fail-closed).
     */
    static boolean boolField(String json, String key) {
        if (json == null) {
            return false;
        }
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("\"" + java.util.regex.Pattern.quote(key) + "\"\\s*:\\s*(true|false)")
                .matcher(json);
        return m.find() && "true".equals(m.group(1));
    }
}
