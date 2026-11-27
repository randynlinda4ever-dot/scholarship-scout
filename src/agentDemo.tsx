const root = document.getElementById("root");

if (!root) {
  throw new Error("The agent demo could not find its application root.");
}

if (globalThis.__SCHOLARSHIP_SCOUT_PREVIEW_DEMO_ENABLED__ !== true) {
  document.title = "Agent demo unavailable | Scholarship Scout";
  root.textContent = "The synthetic agent demo is available only in local development and preview deployments.";
} else {
  document.title = "Agent Test Demo | Scholarship Scout";
  const [{ createRoot }, { default: AgentDemo }] = await Promise.all([
    import("react-dom/client"),
    import("./features/agent-demo/AgentDemo"),
  ]);
  createRoot(root).render(<AgentDemo />);
}
