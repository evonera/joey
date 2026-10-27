import { NextResponse } from "next/server";

const spec = {
  openapi: "3.1.0",
  info: {
    title: "Joey Public API",
    version: "1.0.0",
    description:
      "REST API for managing Joey drafts, approvals, accounts, and published posts programmatically. Authenticate with a Bearer token generated in Settings → Developer API. All endpoints are scoped to the workspace that owns the token and rate-limited to 60 requests/minute.",
  },
  servers: [{ url: "https://joey.evonera.com" }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description:
          "Token created via Settings → Developer API (format: joe_...). Scopes: read, write, approve.",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: { error: { type: "string" } },
        required: ["error"],
      },
      Draft: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          tenantId: { type: "string" },
          content: { type: "string", nullable: true },
          status: {
            type: "string",
            enum: [
              "pending_review",
              "approved",
              "rejected",
              "scheduled",
              "published",
              "failed",
            ],
          },
          scheduledFor: { type: "string", format: "date-time", nullable: true },
          platformOptions: { type: "object" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Account: {
        type: "object",
        properties: {
          id: { type: "string" },
          platform: { type: "string" },
          accountName: { type: "string", nullable: true },
          status: { type: "string" },
        },
      },
      Post: {
        type: "object",
        properties: {
          id: { type: "string" },
          draftId: { type: "string", nullable: true },
          content: { type: "string", nullable: true },
          status: { type: "string" },
          publishedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
    },
    responses: {
      Unauthorized: {
        description: "Missing, invalid, or expired Bearer token",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      Forbidden: {
        description: "Token lacks the required scope",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      RateLimited: {
        description: "60 requests/minute exceeded; see X-RateLimit-* headers",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/api/v1/scouts": {
      get: { summary: "List saved Scout sources (read scope)", operationId: "listScouts", tags: ["Scouts"], parameters: [{ name: "scoutId", in: "query", schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Up to 100 sources belonging to this token's workspace" }, "401": { $ref: "#/components/responses/Unauthorized" }, "403": { $ref: "#/components/responses/Forbidden" }, "429": { $ref: "#/components/responses/RateLimited" } } },
    },
    "/api/v1/scouts/observations": {
      post: {
        summary: "Supply real source observations (write scope); no approval or publishing", operationId: "submitScoutObservations", tags: ["Scouts"],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", additionalProperties: false, required: ["version", "scoutId", "targetUrl", "platform", "items"], properties: {
          version: { type: "integer", enum: [1] }, scoutId: { type: "string", format: "uuid" }, targetUrl: { type: "string", format: "uri", maxLength: 2048 }, platform: { type: "string", enum: ["instagram", "tiktok", "twitter", "youtube", "web", "rss"] },
          items: { type: "array", minItems: 1, maxItems: 15, items: { type: "object", additionalProperties: false, required: ["id", "url", "text"], properties: { id: { type: "string", maxLength: 120 }, url: { type: "string", format: "uri", maxLength: 2048 }, text: { type: "string", maxLength: 6000 }, views: { type: "number", minimum: 0, maximum: 1e12 }, likes: { type: "number", minimum: 0, maximum: 1e12 }, timestamp: { type: "string", format: "date-time" } } } },
        } } } } },
        responses: { "202": { description: "Evidence queued or an existing durable receipt reused. Observation time is assigned by Joey." }, "400": { description: "Invalid observation; missing metrics must be omitted" }, "409": { description: "Scout belongs to another workspace, was retargeted, or changed during ingestion" }, "413": { description: "Body exceeds 128 KiB" }, "401": { $ref: "#/components/responses/Unauthorized" }, "403": { $ref: "#/components/responses/Forbidden" }, "429": { $ref: "#/components/responses/RateLimited" } },
      },
    },
    "/api/v1/theme-packages/{id}/source-media": {
      post: { summary: "Offer discovered media to a draft package (write scope)", operationId: "offerThemeSourceMedia", tags: ["Theme Studio"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", additionalProperties: false, required: ["sourceUrl", "rightsCategory", "media"], properties: { sourceUrl: { type: "string", format: "uri", maxLength: 2048 }, rightsCategory: { type: "string", enum: ["owned", "public_domain", "cc_by", "cc_by_sa", "commercial_license"] }, media: { type: "array", minItems: 1, maxItems: 8, items: { type: "object", additionalProperties: false, required: ["url", "kind"], properties: { url: { type: "string", format: "uri", maxLength: 4096 }, kind: { type: "string", enum: ["image", "video"] } } } } } } } } }, responses: { "200": { description: "Candidates saved. Choose a candidate in Render media to import and register a workspace asset." }, "400": { description: "Invalid source, media, package ID or reuse rights" }, "409": { description: "Package cannot be edited or changed during discovery" }, "413": { description: "Body exceeds 64 KiB" }, "401": { $ref: "#/components/responses/Unauthorized" }, "403": { $ref: "#/components/responses/Forbidden" }, "429": { $ref: "#/components/responses/RateLimited" } } },
    },
    "/api/v1/accounts": {
      get: {
        summary: "List connected social accounts",
        operationId: "listAccounts",
        tags: ["Accounts"],
        responses: {
          "200": {
            description: "Connected accounts for the token's workspace",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    accounts: { type: "array", items: { $ref: "#/components/schemas/Account" } },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "429": { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/api/v1/drafts": {
      get: {
        summary: "List drafts",
        operationId: "listDrafts",
        tags: ["Drafts"],
        parameters: [
          {
            name: "status",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["pending_review", "approved", "rejected", "scheduled", "published", "failed"],
            },
            description: "Filter by draft status",
          },
        ],
        responses: {
          "200": {
            description: "Drafts ordered by creation date (newest first)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    drafts: { type: "array", items: { $ref: "#/components/schemas/Draft" } },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "429": { $ref: "#/components/responses/RateLimited" },
        },
      },
      post: {
        summary: "Create a draft",
        operationId: "createDraft",
        tags: ["Drafts"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["content"],
                properties: {
                  content: { type: "string", description: "Post text. May be empty when at least one media URL is supplied." },
                  mediaUrls: {
                    type: "array",
                    items: { type: "string", format: "uri" },
                    description: "Media attachment URLs",
                  },
                  accountIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "Target account IDs",
                  },
                  scheduledFor: {
                    type: "string",
                    format: "date-time",
                    description: "Optional publish time (ISO 8601)",
                  },
                },
              },
              examples: {
                basic: {
                  value: {
                    content: "Excited to announce our latest release!",
                    scheduledFor: "2026-09-01T09:00:00Z",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Created draft with status pending_review",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { draft: { $ref: "#/components/schemas/Draft" } },
                },
              },
            },
          },
          "400": { description: "Invalid request body", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "429": { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/api/v1/drafts/approve": {
      post: {
        summary: "Approve a draft",
        description:
          "Marks a pending draft as approved. Optionally select an A/B variant by providing variantName + content.",
        operationId: "approveDraft",
        tags: ["Drafts"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["id"],
                properties: {
                  id: { type: "string", description: "Draft ID" },
                  variantName: { type: "string", description: "Variant to select (optional)" },
                  content: { type: "string", description: "Override content when selecting a variant (optional)" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Draft approved",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean", enum: [true] } },
                },
              },
            },
          },
          "400": { description: "Missing id or draft has no content", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "429": { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/api/v1/drafts/reject": {
      post: {
        summary: "Reject a draft",
        description: "Marks a draft as rejected with feedback routed back to the agent.",
        operationId: "rejectDraft",
        tags: ["Drafts"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["id"],
                properties: {
                  id: { type: "string", description: "Draft ID" },
                  feedback: { type: "string", description: "Why the draft was rejected" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Draft rejected",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean", enum: [true] } },
                },
              },
            },
          },
          "400": { description: "Missing id", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "429": { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/api/v1/posts": {
      get: {
        summary: "List published posts",
        operationId: "listPosts",
        tags: ["Posts"],
        responses: {
          "200": {
            description: "Published posts for the token's workspace",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    posts: { type: "array", items: { $ref: "#/components/schemas/Post" } },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "429": { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
  },
} as const;

export async function GET() {
  return NextResponse.json(spec);
}
