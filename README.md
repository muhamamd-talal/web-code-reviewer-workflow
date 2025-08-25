# Web Code Reviewer Workflow

A GitHub Action that processes DeepReview comments, adds reviewers, and creates JIRA tickets for critical issues found during code review.

## Features

- 🔍 Parses DeepReview comments for critical issues
- 👥 Automatically assigns reviewers to pull requests
- 🎫 Creates JIRA tickets for critical issues when PRs are merged
- 🔄 Configurable JIRA integration (board, assignee, etc.)

## Usage

Add this action to your workflow:

```yaml
name: Code Review Workflow
on:
  pull_request:
    types: [opened, synchronize, reopened, labeled, unlabeled, closed]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Process Code Review
        uses: muhammad-talal/web-code-reviewer-workflow@v2.0.0
        with:
          reviewer_name: 'your-reviewer'
          jira_assignee_email: 'assignee@example.com'
          jira_board_key: 'YOUR-BOARD'
          jira_base_url: ${{ secrets.JIRA_BASE_URL }}
          jira_api_token: ${{ secrets.JIRA_API_TOKEN }}
```

## Inputs

| Input | Description | Required |
|-------|-------------|----------|
| `reviewer_name` | GitHub username of the reviewer to assign | Yes |
| `jira_assignee_email` | Email of the JIRA user to assign tickets to | Yes |
| `jira_board_key` | JIRA board/project key where tickets will be created | Yes |
| `jira_base_url` | Base URL of your JIRA instance | Yes |
| `jira_api_token` | JIRA API token for authentication | Yes |

## Outputs

| Output | Description |
|--------|-------------|
| `has-issues` | Whether any critical issues were found (true/false) |
| `issues` | JSON string containing all critical issues found |
| `ticket-key` | Key of the created JIRA ticket (if any) |

## Workflow

1. When a PR is opened or updated:
   - Parses the DeepReview comment for critical issues
   - Assigns the specified reviewer to the PR

2. When a PR is merged:
   - Creates a JIRA ticket with all critical issues
   - Assigns the ticket to the specified user
   - Links back to the PR for reference

## JIRA Ticket Format

The created JIRA tickets will include:
- Summary with PR number and issue count
- Detailed description of each issue
- Severity scores and impact analysis
- File locations and suggested fixes
- Link back to the original PR
- Labels: `deep-review`, `security`, `automated`

## Requirements

- GitHub repository with pull request access
- JIRA instance with API access
- DeepReview comments in the expected format

## Setup

1. Create the necessary secrets in your GitHub repository:
   - `JIRA_BASE_URL`
   - `JIRA_API_TOKEN`

2. Add the workflow file to your repository:
   `.github/workflows/code-review.yml`

3. Configure the inputs according to your needs

## License

MIT

## Support

For issues and feature requests, please use the [GitHub issue tracker](https://github.com/tajawal/web-code-reviewer-workflow/issues).
