export function buildMindMapPrompt(conversation: string): string {
  return `You are an expert Chat visualizer.

**Task:**
Generate a structured, flexible hierarchical mind map from the following conversation.
The structure should be natural and balanced: Central Idea -> Major Categories -> Sub-categories -> Specific Details.
You may go up to 3-4 levels deep where appropriate.

**Conversation to visualize:**
${conversation}

**CRITICAL OUTPUT RULES:**
1. Output ONLY valid, raw JSON. Nothing else.
2. Do NOT use Markdown code blocks (no \`\`\`json, no \`\`\`).
3. Do NOT output Mermaid syntax, diagrams, or any non-JSON format.
4. Do NOT include any text, explanation, or commentary before or after the JSON.
5. The response must be parsable by JSON.parse() directly.
6. Start your response with { and end with }.

**Mind Map logic:**
1. **Root:** The central topic of the conversation.
2. **Level 1 (Categories):** 4-6 distinct, high-level categories (e.g., "History", "Origin", "Uses").
3. **Level 2+ (Sub-categories/Leaves):** Recursively break down complex categories into sub-categories. Ensure you reach 3-4 levels of depth where necessary.
4. **Leaves:** The final nodes should be specific examples or facts.
5. **Labels:** Keep \`label\` short (1-4 words).
6. **Summaries:** Ensure the "summary" fields are detailed and informative.

**Schema Requirements:**
Use this EXACT JSON structure.
- \`type\` must be: "root", "category", "leaf".
- Ensure \`hierarchy\` matches \`edges\`.

**Output Structure:**
{
  "metadata": { "topic": "...", "contentType": "mindmap", "nodeCount": 0 },
  "nodes": [
    { "id": "root", "data": { "label": "Main Topic", "type": "root", "summary": "Central overview (2-3 sentences).", "hoverSummary": "Short one-liner." } },
    { "id": "cat1", "data": { "label": "Category", "type": "category", "summary": "Branch explanation (2-3 sentences).", "hoverSummary": "Short one-liner." } },
    { "id": "leaf1", "data": { "label": "Detail", "type": "leaf", "summary": "Specific fact (2-3 sentences).", "hoverSummary": "Short one-liner." } }
  ],
  "edges": [
    { "id": "e1", "source": "root", "target": "cat1", "type": "connects" },
    { "id": "e2", "source": "cat1", "target": "leaf1", "type": "connects" }
  ],
  "hierarchy": {
    "root": ["cat1"],
    "cat1": ["leaf1"]
  }
}

**Constraint Checklist:**
- Every node must appear in at least one edge (except root as source).
- hierarchy keys must match edge sources, hierarchy values must match edge targets.
- nodeCount in metadata must equal the total number of nodes.
- All IDs must be unique.
- Output raw JSON only, no extra text.
- NEVER use Mermaid, Markdown, or any diagram syntax. JSON ONLY.
- Your entire response must be a single valid JSON object.`;
}
