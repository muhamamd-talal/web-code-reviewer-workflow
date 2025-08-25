const { execSync } = require("child_process");

async function parseIssues({ github, context, core }) {
  const { data: comments } = await github.rest.issues.listComments({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.issue.number,
  });

  const deepReviewComment = comments.find((comment) =>
    comment.body.includes("DeepReview"),
  );

  if (!deepReviewComment) {
    core.setFailed("Deep Review comment not found");
    return;
  }

  console.log("✅ Found DeepReview comment");
  console.log("Comment content:", deepReviewComment.body);

  const criticalIssues = parseCriticalIssues(deepReviewComment.body);
  console.log("Found critical issues:", criticalIssues);

  if (criticalIssues.length > 0) {
    core.setOutput("has-issues", "true");
    core.setOutput("issues", JSON.stringify(criticalIssues));
    // Save for next steps
    core.exportVariable("DEEP_REVIEW_CONTENT", deepReviewComment.body);
  }
}

async function addReviewer({ github, context, core }) {
  const reviewer = process.env.REVIEWER_NAME;
  if (!reviewer) {
    core.setFailed("REVIEWER_NAME environment variable is required");
    return;
  }

  await github.rest.pulls.requestReviewers({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: context.issue.number,
    reviewers: [reviewer],
  });
  console.log(`✅ Added reviewer ${reviewer} to PR`);
}

async function createJiraTicket({ core, context }) {
  try {
    const jiraBaseUrl = process.env.JIRA_BASE_URL;
    const jiraToken = process.env.JIRA_API_TOKEN;
    const email = process.env.JIRA_ASSIGNEE_EMAIL;
    const boardKey = process.env.JIRA_BOARD_KEY;
    const prNumber = context.payload.pull_request.number;
    const prUrl = context.payload.pull_request.html_url;
    const issues = JSON.parse(process.env.ISSUES || "[]");

    if (!email) {
      throw new Error("JIRA_ASSIGNEE_EMAIL environment variable is required");
    }

    if (!boardKey) {
      throw new Error("JIRA_BOARD_KEY environment variable is required");
    }

    // Get JIRA account ID
    console.log(`Getting JIRA account ID for ${email}...`);
    const accountId = await getJiraAccountId(jiraBaseUrl, jiraToken, email);
    console.log("✅ Found JIRA account ID:", accountId);

    // Count issues and affected files
    const issueCount = issues.length;
    const affectedFiles = [...new Set(issues.map((i) => i.file))].length;

    // Format description
    const description = issues
      .map(
        (issue) =>
          `🔴 ${issue.type} Issue (Severity: ${issue.severityScore})\n` +
          `File: ${issue.file}\n\n` +
          `${issue.rawContent}\n\n---\n\n`,
      )
      .join("");

    // Create JIRA ticket
    const payload = createJiraPayload({
      key: boardKey,
      summary: `PR #${prNumber} - ${context.repo.repo}: ${issueCount} Critical Issues Found`,
      description: `Critical issues found in PR review:\n\n${description}`,
      prUrl,
      accountId,
      affectedFiles: affectedFiles.toString(),
    });

    const response = execSync(
      `curl -s -w "\\n%{http_code}" --user "${jiraToken}:" -H "Accept: application/json" -H "Content-Type: application/json" -d '${JSON.stringify(payload)}' "${jiraBaseUrl}/rest/api/3/issue"`,
    );
    const [body, statusCode] = response.toString().split("\n");

    if (statusCode === "201") {
      const ticketKey = JSON.parse(body).key;
      console.log("✅ Created JIRA ticket:", ticketKey);
      core.setOutput("ticket-key", ticketKey);
    } else {
      throw new Error(`Failed to create JIRA ticket: ${body}`);
    }
  } catch (error) {
    core.setFailed(error.message);
    console.error("Error response:", error);
  }
}

// Helper functions
function parseCriticalIssues(content) {
  const criticalIssues = [];
  const parts = content.split("🔴").slice(1);

  for (const part of parts) {
    const endMarkers = ["🟡", "📊", "💡", "🔴"];
    let endIndex = part.length;

    for (const marker of endMarkers) {
      const index = part.indexOf(marker);
      if (index !== -1 && index < endIndex) {
        endIndex = index;
      }
    }

    const issueContent = part.substring(0, endIndex).trim();
    const idMatch = issueContent.match(/([A-Z]+-\d+)\s+-\s+([A-Z]+)/);
    const fileMatch = issueContent.match(/File:\s+(.+?)\s+\(/);
    const severityMatch = issueContent.match(/Severity Score:\s+([\d.]+)/);
    const confidenceMatch = issueContent.match(/Confidence:\s+(\d+)%/);
    const impactMatch = issueContent.match(/Impact:\s+([^\n]+)/);
    const fixSummaryMatch = issueContent.match(/Fix Summary:\s+([^\n]+)/);

    if (idMatch) {
      criticalIssues.push({
        id: idMatch[1],
        type: idMatch[2],
        file: fileMatch ? fileMatch[1] : "",
        severityScore: severityMatch ? parseFloat(severityMatch[1]) : 0,
        confidence: confidenceMatch ? parseInt(confidenceMatch[1]) : 0,
        impact: impactMatch ? impactMatch[1].trim() : "",
        fixSummary: fixSummaryMatch ? fixSummaryMatch[1].trim() : "",
        rawContent: issueContent,
      });
    }
  }
  return criticalIssues;
}

async function getJiraAccountId(jiraBaseUrl, jiraToken, email) {
  const response = execSync(
    `curl -s --user "${jiraToken}:" -H "Accept: application/json" "${jiraBaseUrl}/rest/api/3/user/search?query=${email}"`,
  );
  const userData = JSON.parse(response);
  if (!userData[0]?.accountId) {
    throw new Error("Failed to get JIRA account ID");
  }
  return userData[0].accountId;
}

function createJiraPayload({
  key,
  summary,
  description,
  prUrl,
  accountId,
  affectedFiles,
}) {
  return {
    fields: {
      project: { key },
      summary,
      description: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "🚨 Summary:\n• Total Issues: ",
              },
              {
                type: "text",
                text: summary,
                marks: [{ type: "strong" }],
              },
              {
                type: "text",
                text: "\n• Affected Files: ",
              },
              {
                type: "text",
                text: affectedFiles,
                marks: [{ type: "strong" }],
              },
              {
                type: "text",
                text: "\n\n📝 Detailed Issues:\n\n",
              },
            ],
          },
          {
            type: "codeBlock",
            attrs: { language: "text" },
            content: [{ type: "text", text: description }],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "\n🔗 PR Link: ",
              },
              {
                type: "text",
                text: prUrl,
                marks: [{ type: "link", attrs: { href: prUrl } }],
              },
            ],
          },
        ],
      },
      issuetype: {
        name: "Task",
      },
      assignee: {
        accountId,
      },
      labels: ["deep-review", "security", "automated"],
    },
  };
}

module.exports = {
  parseIssues,
  addReviewer,
  createJiraTicket,
};
