import type { UserRole } from "@workflow/contracts";
export const fixtureDepartments = [
    { id: "20000000-0000-4000-8000-000000000001", code: "OPS", name: "Operations" },
    { id: "20000000-0000-4000-8000-000000000002", code: "FIN", name: "Finance" },
];
export const fixtureUsers: { id: string; email: string; displayName: string; isActive: boolean; roles: UserRole[]; departmentId: string }[] = [
    { id: "10000000-0000-4000-8000-000000000001", email: "requester-a@example.test", displayName: "Requester A", isActive: true, roles: ["REQUESTER"], departmentId: fixtureDepartments[0]!.id },
    { id: "10000000-0000-4000-8000-000000000002", email: "requester-b@example.test", displayName: "Requester B", isActive: true, roles: ["REQUESTER"], departmentId: fixtureDepartments[1]!.id },
    { id: "10000000-0000-4000-8000-000000000003", email: "reviewer@example.test", displayName: "Reviewer", isActive: true, roles: ["REVIEWER"], departmentId: fixtureDepartments[0]!.id },
    { id: "10000000-0000-4000-8000-000000000004", email: "multi@example.test", displayName: "Multi Role", isActive: true, roles: ["REQUESTER", "REVIEWER"], departmentId: fixtureDepartments[0]!.id },
    { id: "10000000-0000-4000-8000-000000000005", email: "admin@example.test", displayName: "Administrator", isActive: true, roles: ["ADMINISTRATOR"], departmentId: fixtureDepartments[0]!.id },
    { id: "10000000-0000-4000-8000-000000000006", email: "disabled@example.test", displayName: "Disabled", isActive: false, roles: ["REQUESTER"], departmentId: fixtureDepartments[0]!.id },
];
