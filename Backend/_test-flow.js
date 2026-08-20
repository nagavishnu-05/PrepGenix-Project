const http = require("http");

const BASE = "http://localhost:8080";

function req(method, path, body, token) {
    return new Promise((ok, no) => {
        const url = new URL(path, BASE);
        const headers = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = "Bearer " + token;
        const r = http.request(url, { method, headers, timeout: 15000 }, (res) => {
            let d = "";
            res.on("data", (c) => (d += c));
            res.on("end", () => ok({ s: res.status || res.statusCode, b: d }));
        });
        r.on("error", no);
        r.on("timeout", () => { r.destroy(); no(new Error("TIMEOUT:" + path)); });
        if (body) r.write(JSON.stringify(body));
        r.end();
    });
}

(async () => {
    console.log("=== 1. Health check ===");
    const h = await req("GET", "/api/health");
    console.log("  Health:", h.s, h.b.substring(0, 60));

    console.log("\n=== 2. Student login ===");
    const login = await req("POST", "/api/auth/login", { role: "student", username: "2023001", password: "23CS001" });
    console.log("  Login:", login.s);
    if (login.s !== 200) { console.log("  FAIL:", login.b); process.exit(1); }
    const { token, user } = JSON.parse(login.b);
    console.log("  User:", user.username, user.role);

    console.log("\n=== 3. /auth/me ===");
    const me = await req("GET", "/api/auth/me", null, token);
    console.log("  Me:", me.s, me.b.substring(0, 100));

    console.log("\n=== 4. /tests ===");
    const tests = await req("GET", "/api/tests", null, token);
    console.log("  Tests:", tests.s, tests.b.substring(0, 200));

    console.log("\n=== 5. /interviews ===");
    const iv = await req("GET", "/api/interviews", null, token);
    console.log("  Interviews:", iv.s, iv.b.substring(0, 200));

    console.log("\n=== 6. /reports/overview ===");
    const ro = await req("GET", "/api/reports/overview", null, token);
    console.log("  Reports:", ro.s, ro.b.substring(0, 200));

    console.log("\n=== ALL PASSED ===");
})().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
