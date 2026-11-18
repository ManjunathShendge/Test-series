# Exam Prep Marketplace

Implementation blueprint prepared on 11 November 2026 from [requirement.text](requirement.text), the [19-page PRD](PRD__Exam_Prep_Marketplace.pdf), and [SKILL.md](SKILL.md).

The repository contains a student mobile demo plus the development foundation for the API, worker and web app. Mobile uses synthetic local data; real authentication, billing and domain APIs are not implemented. Local services, migrations, environment validation and CI are described in [SETUP](docs/SETUP.md). No production deployment has been provisioned.

## Start here

1. Read [CLAUDE.md](CLAUDE.md) for project instructions.
2. Read [decisions and conflicts](docs/DECISIONS.md) before making product assumptions.
3. Use [ROADMAP](docs/ROADMAP.md) to implement one milestone at a time.
4. Follow [SETUP](docs/SETUP.md) to run the local stack; use [PROMPTS](docs/PROMPTS.md) for later milestones.
5. Track evidence in [PROJECT_STATUS](docs/PROJECT_STATUS.md).

## Documentation map

| Area | Documents |
|---|---|
| Product and scope | [PRD transcription](docs/PRD.md), [requirements matrix](docs/REQUIREMENTS.md), [decisions](docs/DECISIONS.md) |
| System | [Architecture](docs/ARCHITECTURE.md), [data model](docs/DATA_MODEL.md), [API contracts](docs/API_CONTRACTS.md) |
| Clients | [Web](docs/WEB.md), [mobile](docs/MOBILE.md), [attempt engine](docs/TEST_ENGINE.md) |
| Business workflows | [QC](docs/QC_PIPELINE.md), [authoring/import](docs/CONTENT_AUTHORING.md), [payments](docs/PAYMENTS.md), [results](docs/RESULTS.md), [notifications](docs/NOTIFICATIONS.md) |
| Design | [Master](design-system/exam-prep-marketplace/MASTER.md), [attempt](design-system/exam-prep-marketplace/pages/attempt.md), [reviewer](design-system/exam-prep-marketplace/pages/reviewer.md) |
| Delivery | [Setup](docs/SETUP.md), [infrastructure](docs/INFRA.md), [security](docs/SECURITY.md), [testing](docs/TESTING.md), [operations](docs/OPERATIONS.md), [launch](docs/LAUNCH_CHECKLIST.md) |
| AI-assisted work | [Prompts](docs/PROMPTS.md), [workflow](docs/CLAUDE_WORKFLOW.md), [roadmap](docs/ROADMAP.md), [status](docs/PROJECT_STATUS.md) |
| Evidence | [Source register](docs/SOURCES.md), [spike templates](docs/spikes/README.md) |

Root and scoped `CLAUDE.md` files contain coding instructions. Detailed design lives in `docs/`; do not load every document into every task. Original input files remain unchanged.
