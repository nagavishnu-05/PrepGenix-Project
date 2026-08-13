const rawApiBase = import.meta.env.VITE_API_URL || "/api";
const API_BASE = rawApiBase.replace(/\/+$/, "").replace(/\/api$/, "") + "/api";

async function request(endpoint, options = {}) {
    const token = localStorage.getItem("auth-token");
    const headers = { ...(options.headers || {}) };
    if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    const body = options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined;
    const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers, body });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        if (res.status === 401 && !endpoint.startsWith("/auth/login")) {
            localStorage.removeItem("auth-token");
            window.dispatchEvent(new Event("auth-unauthorized"));
        }
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
}

function qs(params = {}) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "") sp.set(k, v);
    }
    const s = sp.toString();
    return s ? `?${s}` : "";
}

function formData(file, extra = {}) {
    const fd = new FormData();
    fd.append("file", file);
    for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null) fd.append(k, v);
    return fd;
}

export const api = {
    auth: {
        login: (role, username, password) => request("/auth/login", { method: "POST", body: { role, username, password } }),
        me: () => request("/auth/me"),
        changePassword: (currentPassword, newPassword) => request("/auth/password", { method: "PUT", body: { currentPassword, newPassword } }),
        createCoordinator: (data) => request("/auth/coordinators", { method: "POST", body: data }),
    },
    students: {
        list: (params) => request(`/students${qs(params)}`),
        batches: () => request("/students/batches"),
        get: (regNo) => request(`/students/${regNo}`),
        create: (data) => request("/students", { method: "POST", body: data }),
        update: (regNo, data) => request(`/students/${regNo}`, { method: "PUT", body: data }),
        remove: (regNo) => request(`/students/${regNo}`, { method: "DELETE" }),
        importExcel: (file) => request("/students/import", { method: "POST", body: formData(file) }),
        performance: (regNo) => request(`/students/${regNo}/performance`),
    },
    questions: {
        list: (params) => request(`/questions${qs(params)}`),
        get: (id) => request(`/questions/${id}`),
        create: (data) => request("/questions", { method: "POST", body: data }),
        update: (id, data) => request(`/questions/${id}`, { method: "PUT", body: data }),
        remove: (id) => request(`/questions/${id}`, { method: "DELETE" }),
        importExcel: (file, kind) => request("/questions/import", { method: "POST", body: formData(file, { kind }) }),
        aimlFiles: () => request("/questions/aiml-files"),
        aimlImport: (file) => request("/questions/aiml-import", { method: "POST", body: { file } }),
    },
        tests: {
            list: () => request("/tests"),
            get: (id) => request(`/tests/${id}`),
            create: (data) => request("/tests", { method: "POST", body: data }),
            update: (id, data) => request(`/tests/${id}`, { method: "PUT", body: data }),
            remove: (id) => request(`/tests/${id}`, { method: "DELETE" }),
            assign: (id, data) => request(`/tests/${id}/assign`, { method: "POST", body: data }),
            start: (id) => request(`/tests/${id}/start`, { method: "POST", body: {} }),
            attempt: (attemptId) => request(`/tests/attempts/${attemptId}`),
            nextQuestion: (attemptId) => request(`/tests/attempts/${attemptId}/question`),
            answer: (attemptId, data) => request(`/tests/attempts/${attemptId}/answer`, { method: "POST", body: data }),
            finish: (attemptId) => request(`/tests/attempts/${attemptId}/finish`, { method: "POST", body: {} }),
            result: (attemptId) => request(`/tests/attempts/${attemptId}/result`),
            importQuestions: (file, data) => request("/tests/import-questions", { method: "POST", body: formData(file, data) }),
        },
    judge: {
        run: (code, language, input) => request("/judge/run", { method: "POST", body: { code, language, input } }),
    },
    resumes: {
        list: (params) => request(`/resumes${qs(params)}`),
        get: (regNo) => request(`/resumes/${regNo}`),
        upload: (regNo, file) => request(`/resumes/${regNo}/upload`, { method: "POST", body: formData(file) }),
        parse: (regNo) => request(`/resumes/${regNo}/parse`, { method: "POST", body: {} }),
        updateCategories: (regNo, categories, topCategory) => request(`/resumes/${regNo}/categories`, { method: "PUT", body: { categories, topCategory } }),
        remove: (regNo) => request(`/resumes/${regNo}`, { method: "DELETE" }),
    },
    interviews: {
        list: () => request("/interviews"),
        get: (id) => request(`/interviews/${id}`),
        create: (data) => request("/interviews", { method: "POST", body: data }),
        result: (id, data) => request(`/interviews/${id}/result`, { method: "POST", body: data }),
        update: (id, data) => request(`/interviews/${id}`, { method: "PUT", body: data }),
        remove: (id) => request(`/interviews/${id}`, { method: "DELETE" }),
    },
    reports: {
        overview: () => request("/reports/overview"),
        students: (params) => request(`/reports/students${qs(params)}`),
        perTest: (id) => request(`/reports/tests/${id}`),
        perStudent: (regNo) => request(`/reports/student/${regNo}`),
    },
    proctoring: {
        report: (data) => request("/proctoring/report", { method: "POST", body: data }),
        analyze: (data) => request("/proctoring/analyze", { method: "POST", body: data }),
        attempt: (attemptId) => request(`/proctoring/attempt/${attemptId}`),
        resetAttempt: (attemptId) => request(`/proctoring/attempt/${attemptId}/reset`, { method: "POST", body: {} }),
        test: (testId) => request(`/proctoring/test/${testId}`),
        live: () => request("/proctoring/live"),
    },
};
