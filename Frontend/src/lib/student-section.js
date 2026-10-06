export function getStudentSection(regNo) {
    const match = String(regNo || "").match(/CSE([A-D])(?=\d|$)/i);
    return match?.[1]?.toUpperCase() || null;
}

function getBatchStartYear(batch) {
    const match = String(batch || "").match(/(?:19|20)?(\d{2})\s*[-–/]\s*(?:19|20)?\d{2}/);
    if (!match) return null;
    return 2000 + Number(match[1]);
}

export function getSectionsForBatch(batch, students) {
    const scopedStudents = students.filter((student) => batch === "all" || student.batch === batch);
    const scopedBatches = batch === "all"
        ? [...new Set(students.map((student) => student.batch).filter(Boolean))]
        : [batch];
    const hasDSectionBatch = scopedBatches.some((item) => {
        const year = getBatchStartYear(item);
        return year !== null && year >= 2025;
    });
    const hasUnclassifiedBatch = scopedBatches.some((item) => getBatchStartYear(item) === null);
    const hasDSectionId = scopedStudents.some((student) => getStudentSection(student.regNo) === "D");
    const sections = ["A", "B", "C"];

    if (hasDSectionBatch || (hasUnclassifiedBatch && hasDSectionId)) {
        sections.push("D");
    }

    return sections;
}
