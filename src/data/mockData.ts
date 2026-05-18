export const oldMarkdown = `# Quarterly Sales Repost

Looking ahead, the Q4 forecast projects a **continued** upward trend for the business.

Our product mix still favors enterprise contracts, while smaller self-serve plans are growing steadily.

\`\`\`javascript
function calculateRevenue(sales) {
  return sales.reduce((sum, item) => sum + item.amount, 0);
}
\`\`\`

| Region | Revenue | Growth |
|--------|---------|--------|
| North America | \$1,250,000 | +2.1% |
| Europe | \$980,000 | +1.4% |
| Asia | \$720,000 | +9.8% |

The marketing team should focus on sustaining growth.`

export const newMarkdown = `# Quarterly Sales Report

Looking ahead, the Q4 forecast projects a continued upward trend for the business.

Our product mix still favors enterprise contracts, while smaller self-serve plans are growing very steadily.

We also added regional expansion plans for Asia-Pacific.

\`\`\`javascript
function calculateRevenue(sales) {
  const tax = 0.08;
  return sales.reduce((sum, item) => sum + item.amount * (1 + tax), 0);
}
\`\`\`

\`\`\`python
def calculate_revenue(sales):
    return sum(item['amount'] for item in sales)
\`\`\`

| Region | Revenue | Growth |
|--------|---------|--------|
| North America | \$1,310,000 | +4.8% |
| Europe | \$1,150,000 | +17.3% |
| Asia | \$870,000 | +20.8% |

The marketing team should focus on sustaining growth in Asia and Europe.`
