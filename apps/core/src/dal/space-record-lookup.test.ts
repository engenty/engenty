import { describe, expect, it } from "vitest";
import { findSpaceIdForRecord } from "./space-record-lookup.js";

const TENANT = "11111111-1111-1111-1111-111111111111";
const SPACE_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROJECT_ID = "project-marketing";
const PHASE_ID = "phase-marketing";
const PHASE_TASK_ID = "task-launch";
const KB_ID = "kb-handbook";
const ARTICLE_ID = "article-onboarding";
const ATTACHMENT_ID = "attachment-handbook-pdf";
const FILE_UUID = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const FOLDER_UUID = "99999999-9999-4999-8999-999999999999";

interface MockRow {
  article_id?: string;
  id: string;
  kb_id?: string;
  owner_id?: string;
  owner_type?: string;
  project_id?: string;
  schema: string;
  space_id?: string;
  table: string;
  tenant_id: string;
}

function stubClient(rows: MockRow[]) {
  return {
    schema(schema: string) {
      return {
        from(table: string) {
          const filters: Record<string, string> = {};
          const builder = {
            eq(column: string, value: string) {
              filters[column] = value;
              return builder;
            },
            maybeSingle() {
              const found = rows.find(
                (row) =>
                  row.schema === schema &&
                  row.table === table &&
                  (!filters.id || row.id === filters.id) &&
                  (!filters.tenant_id || row.tenant_id === filters.tenant_id)
              );
              return Promise.resolve({ data: found ?? null, error: null });
            },
            select() {
              return builder;
            },
          };
          return builder;
        },
      };
    },
  };
}

const ROWS: MockRow[] = [
  {
    id: PROJECT_ID,
    schema: "module_projects",
    space_id: SPACE_A,
    table: "projects",
    tenant_id: TENANT,
  },
  {
    id: PHASE_ID,
    project_id: PROJECT_ID,
    schema: "module_projects",
    table: "project_phases",
    tenant_id: TENANT,
  },
  {
    id: PHASE_TASK_ID,
    project_id: PROJECT_ID,
    schema: "module_projects",
    table: "phase_tasks",
    tenant_id: TENANT,
  },
  {
    id: KB_ID,
    schema: "module_kb",
    space_id: SPACE_A,
    table: "knowledge_bases",
    tenant_id: TENANT,
  },
  {
    id: ARTICLE_ID,
    kb_id: KB_ID,
    schema: "module_kb",
    table: "articles",
    tenant_id: TENANT,
  },
  {
    article_id: ARTICLE_ID,
    id: ATTACHMENT_ID,
    schema: "module_kb",
    table: "attachments",
    tenant_id: TENANT,
  },
  {
    id: FILE_UUID,
    owner_id: SPACE_A,
    owner_type: "space",
    schema: "module_files",
    table: "file_entries",
    tenant_id: TENANT,
  },
  {
    id: FOLDER_UUID,
    owner_id: PROJECT_ID,
    owner_type: "project",
    schema: "module_files",
    table: "file_folders",
    tenant_id: TENANT,
  },
];

describe("findSpaceIdForRecord", () => {
  const client = stubClient(ROWS) as never;

  it("resolves a project and its children through the project space", async () => {
    expect(
      await findSpaceIdForRecord(client, {
        moduleId: "projects",
        recordId: PROJECT_ID,
        tenantId: TENANT,
      })
    ).toBe(SPACE_A);
    expect(
      await findSpaceIdForRecord(client, {
        moduleId: "projects",
        recordId: PHASE_ID,
        tenantId: TENANT,
      })
    ).toBe(SPACE_A);
    expect(
      await findSpaceIdForRecord(client, {
        moduleId: "projects",
        recordId: PHASE_TASK_ID,
        tenantId: TENANT,
      })
    ).toBe(SPACE_A);
  });

  it("resolves a KB attachment through its article and knowledge base", async () => {
    expect(
      await findSpaceIdForRecord(client, {
        moduleId: "knowledge-base",
        recordId: ATTACHMENT_ID,
        tenantId: TENANT,
      })
    ).toBe(SPACE_A);
  });

  it("resolves a space-owned file and a project-owned folder", async () => {
    expect(
      await findSpaceIdForRecord(client, {
        moduleId: "files",
        recordId: FILE_UUID,
        tenantId: TENANT,
      })
    ).toBe(SPACE_A);
    expect(
      await findSpaceIdForRecord(client, {
        moduleId: "files",
        recordId: FOLDER_UUID,
        tenantId: TENANT,
      })
    ).toBe(SPACE_A);
  });
});
