import type { ApprovalPolicyDTO, AssignmentRuleDTO, BudgetPolicyDTO, ConfigurationKind, ConfigurationSearch, CreateAssignmentRule, CreateBudgetPolicy, DepartmentSummary, EligibleReviewer, IPageResult, PolicyContent } from "@workflow/contracts";
import type { IActor } from "../Identity/Identity";
export interface IPolicyRecord
{
    id: string; code: string; version: number; isEnabled: boolean;
    published: ApprovalPolicyDTO | null; draft: PolicyContent | null;
}
export interface IConfigurationRepository
{
    CurrentAdmin(actor: IActor): Promise<IActor>;
    Lock(exclusive: boolean): Promise<void>;
    Search(kind: "approval-policies", query: ConfigurationSearch): Promise<IPageResult<ApprovalPolicyDTO>>;
    Search(kind: "reviewer-assignments", query: ConfigurationSearch): Promise<IPageResult<AssignmentRuleDTO>>;
    Search(kind: "budget-policies", query: ConfigurationSearch): Promise<IPageResult<BudgetPolicyDTO>>;
    Search(kind: "reviewers", query: ConfigurationSearch): Promise<IPageResult<EligibleReviewer>>;
    Search(kind: "departments", query: ConfigurationSearch): Promise<IPageResult<DepartmentSummary>>;
    Policy(id: string): Promise<IPolicyRecord | null>;
    SavePolicy(record: IPolicyRecord): Promise<void>;
    Publish(record: IPolicyRecord, result: ApprovalPolicyDTO): Promise<void>;
    Assignment(id: string): Promise<AssignmentRuleDTO | null>;
    SaveAssignment(value: AssignmentRuleDTO): Promise<void>;
    Budget(id: string): Promise<BudgetPolicyDTO | null>;
    SaveBudget(value: BudgetPolicyDTO): Promise<void>;
    ValidateReferences(typeId: string | null, departmentId: string | null, reviewerIds?: string[]): Promise<boolean>;
    Replay(actorId: string, scope: string, key: string, hash: string): Promise<ApprovalPolicyDTO | null>;
    Complete(actorId: string, scope: string, key: string, hash: string, result: ApprovalPolicyDTO): Promise<void>;
    Audit(actorId: string, id: string, action: string, before: Record<string, unknown> | null, after: Record<string, unknown>): Promise<void>;
}
export interface IConfigurationUnitOfWork
{
    Run<T>(operation: (repository: IConfigurationRepository) => Promise<T>): Promise<T>;
}
export type ConfigurationResult = ApprovalPolicyDTO | AssignmentRuleDTO | BudgetPolicyDTO | EligibleReviewer | DepartmentSummary;
export type { ConfigurationKind, CreateAssignmentRule, CreateBudgetPolicy };
