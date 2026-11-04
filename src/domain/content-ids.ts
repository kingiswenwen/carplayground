export const activityIds = ['E01','E02','E03','M01','M02','M03','M04','C01','C02','C03','S01','S02','S03','T01','T02','T03','H01','H02','H03','A01','A02','L01','L02','L03','P01','T04'] as const;
export type ActivityId = typeof activityIds[number];
export type CoreActivityId = 'E01' | 'E02' | 'M01';
export const sceneIds = ['showroom','parking','workshop','travel'] as const;
export type SceneId = typeof sceneIds[number];
export const domains = ['英语','数学','中文表达','科学','动手思考','社会与人文','艺术创作','生活习惯'] as const;
export type Domain = typeof domains[number];
