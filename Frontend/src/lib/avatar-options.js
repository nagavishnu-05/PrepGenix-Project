export const STUDENT_AVATARS = [
    ...Array.from({ length: 5 }, (_, index) => ({
        id: `boy-${index + 1}`,
        label: `Boy ${index + 1}`,
        group: "Masculine styles",
        image: `/avatars/boy-${index + 1}.jpg`,
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
        id: `girl-${index + 1}`,
        label: `Girl ${index + 1}`,
        group: "Feminine styles",
        image: `/avatars/girl-${index + 1}.jpg`,
    })),
];

export function getAvatarImage(avatar) {
    return STUDENT_AVATARS.find((option) => option.id === avatar)?.image;
}
