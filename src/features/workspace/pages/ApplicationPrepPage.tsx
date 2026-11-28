import type { ApplicationPrepPageModel } from "../pageTypes.js";
import { WorkspaceSubnav } from "../../../components/WorkspaceSubnav.js";
import { ApplicationStatusPill } from "../../../components/StatusPills.js";

export function ApplicationPrepPage({ model }: { model: ApplicationPrepPageModel }) {
  const {
    APPLICATION_CHECKLIST_STEPS,
    applicationProgress,
    countApplicationWords,
    createWorkspaceItemId,
    formatDate,
    items,
    markPrepScholarshipSubmitted,
    prepScholarship,
    prepSummary,
    prepWorkspace,
    RECOMMENDATION_STATUSES,
    saveApplicationTask,
    savePrepWorkspace,
    setPrepScholarshipId,
    setTab,
  } = model;

  return (
    <div className="page narrow">
      <div className="page-heading">
        <div>
          <div className="eyebrow">APPLICATION PREPARATION</div>
          <h1>Application preparation</h1>
          <p>Organize materials, essays, and deadlines for each scholarship.</p>
        </div>
      </div>
      <WorkspaceSubnav
        label="Scholarship management view"
        active="Application prep"
        options={[
          { value: "Scholarships", label: "Tracker" },
          { value: "Application prep", label: "Application preparation" },
        ]}
        onChange={setTab}
      />
      {!prepScholarship ? (
        <div className="panel prep-panel">
          <h2>Start an application workspace</h2>
          <p className="muted">Add a scholarship to your tracker before preparing its application.</p>
          <button className="secondary" onClick={() => setTab("Scholarships")}>Open scholarship tracker</button>
        </div>
      ) : (
        <>
          <section className="panel prep-panel">
            <div className="prep-icon">✎</div>
            <h2>{prepScholarship.name}</h2>
            <p>
              {prepScholarship.provider} · {prepScholarship.award || "Award amount not listed"} · Deadline:{" "}
              {prepScholarship.deadline ? formatDate(prepScholarship.deadline) : prepScholarship.deadlineText || "Not listed"}
            </p>
            <label className="field">
              <span>Scholarship workspace</span>
              <select value={prepScholarship.id} onChange={(event) => setPrepScholarshipId(event.target.value)}>
                {items.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.provider}</option>)}
              </select>
            </label>
            <div className="application-progress">
              <div><b>{prepSummary.completed}/{prepSummary.total} items complete</b><strong>{prepSummary.percent}%</strong></div>
              <progress max={100} value={prepSummary.percent} />
              <small>
                {prepSummary.requiredDocuments} required · {prepSummary.readyDocuments} ready ·{" "}
                {prepSummary.pendingRecommendations} letters pending · {prepSummary.overLimitEssays} essays over limit
              </small>
            </div>
            <h3>Core preparation checklist</h3>
            {APPLICATION_CHECKLIST_STEPS.map((step, index) => (
              <label className="check-row" key={step}>
                <input
                  type="checkbox"
                  checked={Boolean(applicationProgress[prepScholarship.id]?.[index])}
                  onChange={(event) => saveApplicationTask(prepScholarship.id, index, event.target.checked)}
                />
                <span>{step}</span>
              </label>
            ))}
            <small className="deadline-footnote">
              Your preparation notes and drafts stay in this browser and encrypted backups. They are not sent to sponsor records.
            </small>
          </section>

          <div className="prep-section-grid">
            <section className="panel prep-section">
              <div className="prep-section-heading">
                <div><h3>Custom checklist</h3></div>
                <span className="source-tag">{prepWorkspace.customTasks.filter((task) => task.completed).length}/{prepWorkspace.customTasks.length}</span>
              </div>
              <form className="prep-add-form" onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = new FormData(form);
                const title = String(data.get("title") ?? "").trim();
                if (!title) return;
                savePrepWorkspace({
                  ...prepWorkspace,
                  customTasks: [...prepWorkspace.customTasks, {
                    id: createWorkspaceItemId(),
                    title,
                    completed: false,
                    dueDate: String(data.get("dueDate") ?? ""),
                  }],
                });
                form.reset();
              }}>
                <input name="title" aria-label="New checklist task" placeholder="Add a task…" maxLength={160} required />
                <input type="date" name="dueDate" aria-label="Task due date" />
                <button type="submit" className="secondary">Add task</button>
              </form>
              {prepWorkspace.customTasks.length === 0 ? (
                <p className="muted">No custom tasks yet.</p>
              ) : prepWorkspace.customTasks.map((task) => (
                <div className="prep-list-row" key={task.id}>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={(event) => savePrepWorkspace({
                        ...prepWorkspace,
                        customTasks: prepWorkspace.customTasks.map((row) => row.id === task.id
                          ? { ...row, completed: event.target.checked }
                          : row),
                      })}
                    />
                    <span>{task.title}<small>{task.dueDate ? "Due " + formatDate(task.dueDate) : "No due date"}</small></span>
                  </label>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => savePrepWorkspace({
                      ...prepWorkspace,
                      customTasks: prepWorkspace.customTasks.filter((row) => row.id !== task.id),
                    })}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </section>

            <section className="panel prep-section">
              <div className="prep-section-heading">
                <div><h3>Essay prompts and drafts</h3></div>
                <span className="source-tag">{prepWorkspace.essays.length} prompts</span>
              </div>
              <form className="prep-add-form" onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = new FormData(form);
                const title = String(data.get("title") ?? "").trim();
                if (!title) return;
                const limit = Number(data.get("wordLimit") ?? 0);
                savePrepWorkspace({
                  ...prepWorkspace,
                  essays: [...prepWorkspace.essays, {
                    id: createWorkspaceItemId(),
                    title,
                    prompt: String(data.get("prompt") ?? ""),
                    wordLimit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 10000) : 0,
                    draft: "",
                  }],
                });
                form.reset();
              }}>
                <input name="title" aria-label="Essay title" placeholder="Prompt title…" maxLength={160} required />
                <input name="wordLimit" type="number" min="1" max="10000" aria-label="Word limit" placeholder="Word limit" />
                <button type="submit" className="secondary">Add prompt</button>
              </form>
              {prepWorkspace.essays.length === 0 ? (
                <p className="muted">No essay prompts saved yet.</p>
              ) : prepWorkspace.essays.map((essay) => {
                const words = countApplicationWords(essay.draft);
                const over = essay.wordLimit > 0 && words > essay.wordLimit;
                return (
                  <div className="prep-entry-card" key={essay.id}>
                    <div className="prep-section-heading">
                      <b>{essay.title}</b>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => savePrepWorkspace({
                          ...prepWorkspace,
                          essays: prepWorkspace.essays.filter((row) => row.id !== essay.id),
                        })}
                      >
                        Remove
                      </button>
                    </div>
                    <label className="field">
                      <span>Essay title</span>
                      <input
                        value={essay.title}
                        maxLength={160}
                        onChange={(event) => savePrepWorkspace({
                          ...prepWorkspace,
                          essays: prepWorkspace.essays.map((row) => row.id === essay.id
                            ? { ...row, title: event.target.value }
                            : row),
                        })}
                      />
                    </label>
                    <label className="field">
                      <span>Exact sponsor prompt</span>
                      <textarea
                        rows={3}
                        maxLength={5000}
                        value={essay.prompt}
                        onChange={(event) => savePrepWorkspace({
                          ...prepWorkspace,
                          essays: prepWorkspace.essays.map((row) => row.id === essay.id
                            ? { ...row, prompt: event.target.value }
                            : row),
                        })}
                      />
                    </label>
                    <label className="field">
                      <span>Word limit (leave blank when there is none)</span>
                      <input
                        type="number"
                        min="1"
                        max="10000"
                        value={essay.wordLimit || ""}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          savePrepWorkspace({
                            ...prepWorkspace,
                            essays: prepWorkspace.essays.map((row) => row.id === essay.id
                              ? { ...row, wordLimit: Number.isInteger(value) && value > 0 ? Math.min(value, 10000) : 0 }
                              : row),
                          });
                        }}
                      />
                    </label>
                    <label className="field">
                      <span>Draft — keep your own voice and experiences</span>
                      <textarea
                        rows={6}
                        maxLength={20000}
                        value={essay.draft}
                        onChange={(event) => savePrepWorkspace({
                          ...prepWorkspace,
                          essays: prepWorkspace.essays.map((row) => row.id === essay.id
                            ? { ...row, draft: event.target.value }
                            : row),
                        })}
                      />
                    </label>
                    <small className={over ? "prep-word-count is-over" : "prep-word-count"}>
                      {words} words{essay.wordLimit > 0 ? " / " + essay.wordLimit : " · no word limit entered"}{over ? " · over limit" : ""}
                    </small>
                  </div>
                );
              })}
            </section>

            <section className="panel prep-section">
              <div className="prep-section-heading">
                <div><h3>Recommendation requests</h3></div>
                <span className="source-tag">{prepWorkspace.recommenders.filter((person) => person.status === "Received").length}/{prepWorkspace.recommenders.length} received</span>
              </div>
              <form className="prep-add-form" onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = new FormData(form);
                const name = String(data.get("name") ?? "").trim();
                if (!name) return;
                savePrepWorkspace({
                  ...prepWorkspace,
                  recommenders: [...prepWorkspace.recommenders, {
                    id: createWorkspaceItemId(),
                    name,
                    role: String(data.get("role") ?? ""),
                    status: "Not requested",
                    requestedAt: "",
                    dueDate: String(data.get("dueDate") ?? ""),
                    receivedAt: "",
                    notes: "",
                  }],
                });
                form.reset();
              }}>
                <input name="name" aria-label="Recommender name" placeholder="Name…" maxLength={120} required />
                <input name="role" aria-label="Relationship or role" placeholder="Teacher, counselor…" maxLength={120} />
                <input type="date" name="dueDate" aria-label="Recommendation due date" />
                <button type="submit" className="secondary">Add person</button>
              </form>
              {prepWorkspace.recommenders.length === 0 ? (
                <p className="muted">No recommendation requests added.</p>
              ) : prepWorkspace.recommenders.map((person) => (
                <div className="prep-entry-card" key={person.id}>
                  <div className="prep-section-heading">
                    <b>{person.name}</b>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => savePrepWorkspace({
                        ...prepWorkspace,
                        recommenders: prepWorkspace.recommenders.filter((row) => row.id !== person.id),
                      })}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="form-grid">
                    <label className="field">
                      <span>Name</span>
                      <input value={person.name} maxLength={120} onChange={(event) => savePrepWorkspace({
                        ...prepWorkspace,
                        recommenders: prepWorkspace.recommenders.map((row) => row.id === person.id
                          ? { ...row, name: event.target.value }
                          : row),
                      })} />
                    </label>
                    <label className="field">
                      <span>Role</span>
                      <input value={person.role} maxLength={120} onChange={(event) => savePrepWorkspace({
                        ...prepWorkspace,
                        recommenders: prepWorkspace.recommenders.map((row) => row.id === person.id
                          ? { ...row, role: event.target.value }
                          : row),
                      })} />
                    </label>
                    <label className="field">
                      <span>Status</span>
                      <select value={person.status} onChange={(event) => savePrepWorkspace({
                        ...prepWorkspace,
                        recommenders: prepWorkspace.recommenders.map((row) => row.id === person.id
                          ? { ...row, status: event.target.value as typeof person.status }
                          : row),
                      })}>
                        {RECOMMENDATION_STATUSES.map((status) => <option key={status}>{status}</option>)}
                      </select>
                    </label>
                    {([
                      ["Requested on", "requestedAt"],
                      ["Due date", "dueDate"],
                      ["Received on", "receivedAt"],
                    ] as const).map(([label, field]) => (
                      <label className="field" key={field}>
                        <span>{label}</span>
                        <input type="date" value={person[field]} onChange={(event) => savePrepWorkspace({
                          ...prepWorkspace,
                          recommenders: prepWorkspace.recommenders.map((row) => row.id === person.id
                            ? { ...row, [field]: event.target.value }
                            : row),
                        })} />
                      </label>
                    ))}
                  </div>
                  <label className="field">
                    <span>Notes</span>
                    <textarea
                      rows={2}
                      maxLength={1000}
                      value={person.notes}
                      onChange={(event) => savePrepWorkspace({
                        ...prepWorkspace,
                        recommenders: prepWorkspace.recommenders.map((row) => row.id === person.id
                          ? { ...row, notes: event.target.value }
                          : row),
                      })}
                    />
                  </label>
                </div>
              ))}
            </section>

            <section className="panel prep-section">
              <div className="prep-section-heading">
                <div><h3>Required documents and deadlines</h3><p>Choose which suggested materials this sponsor actually requires.</p></div>
                <span className="source-tag">{prepSummary.readyDocuments}/{prepSummary.requiredDocuments} ready</span>
              </div>
              <form className="prep-add-form" onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = new FormData(form);
                const title = String(data.get("title") ?? "").trim();
                if (!title) return;
                savePrepWorkspace({
                  ...prepWorkspace,
                  documents: [...prepWorkspace.documents, {
                    id: createWorkspaceItemId(),
                    title,
                    required: data.get("required") === "on",
                    ready: false,
                    dueDate: String(data.get("dueDate") ?? ""),
                    notes: "",
                  }],
                });
                form.reset();
              }}>
                <input name="title" aria-label="Document name" placeholder="Add a document…" maxLength={160} required />
                <input type="date" name="dueDate" aria-label="Document due date" />
                <label className="check-field"><input type="checkbox" name="required" defaultChecked /><span>Required</span></label>
                <button type="submit" className="secondary">Add document</button>
              </form>
              {prepWorkspace.documents.length === 0 ? (
                <p className="muted">No document rows. Add the materials listed by the sponsor.</p>
              ) : prepWorkspace.documents.map((document) => (
                <div className="prep-document-row" key={document.id}>
                  <div className="prep-document-title">
                    <b>{document.title}</b>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => savePrepWorkspace({
                        ...prepWorkspace,
                        documents: prepWorkspace.documents.filter((row) => row.id !== document.id),
                      })}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="prep-document-controls">
                    <label className="check-field">
                      <input type="checkbox" checked={document.required} onChange={(event) => savePrepWorkspace({
                        ...prepWorkspace,
                        documents: prepWorkspace.documents.map((row) => row.id === document.id
                          ? { ...row, required: event.target.checked }
                          : row),
                      })} />
                      <span>Required</span>
                    </label>
                    <label className="check-field">
                      <input type="checkbox" checked={document.ready} onChange={(event) => savePrepWorkspace({
                        ...prepWorkspace,
                        documents: prepWorkspace.documents.map((row) => row.id === document.id
                          ? { ...row, ready: event.target.checked }
                          : row),
                      })} />
                      <span>Ready</span>
                    </label>
                    <label className="field">
                      <span>Due date</span>
                      <input type="date" value={document.dueDate} onChange={(event) => savePrepWorkspace({
                        ...prepWorkspace,
                        documents: prepWorkspace.documents.map((row) => row.id === document.id
                          ? { ...row, dueDate: event.target.value }
                          : row),
                      })} />
                    </label>
                  </div>
                  <label className="field">
                    <span>Notes</span>
                    <input
                      maxLength={1000}
                      value={document.notes}
                      onChange={(event) => savePrepWorkspace({
                        ...prepWorkspace,
                        documents: prepWorkspace.documents.map((row) => row.id === document.id
                          ? { ...row, notes: event.target.value }
                          : row),
                      })}
                    />
                  </label>
                </div>
              ))}
              <small className="deadline-footnote">
                Check required documents and due dates on the sponsor's official application page.
              </small>
            </section>

            <section className="panel prep-section">
              <div className="prep-section-heading"><div><h3>Final application review</h3></div></div>
              {prepWorkspace.finalReview.map((item) => (
                <label className="check-row" key={item.id}>
                  <input type="checkbox" checked={item.done} onChange={(event) => savePrepWorkspace({
                    ...prepWorkspace,
                    finalReview: prepWorkspace.finalReview.map((row) => row.id === item.id
                      ? { ...row, done: event.target.checked }
                      : row),
                  })} />
                  <span>{item.label}</span>
                </label>
              ))}
            </section>

            <section className="panel prep-section prep-submission">
              <div className="prep-section-heading">
                <div><h3>Submission and decision record</h3><p>This is a personal record only; Scout does not submit applications.</p></div>
                <ApplicationStatusPill status={prepScholarship.applicationStatus || "Not started"} />
              </div>
              <p>
                Submission date: <b>{prepScholarship.submittedAt ? formatDate(prepScholarship.submittedAt) : "Not recorded"}</b>
                {" · "}
                Decision date: <b>{prepScholarship.decisionDate ? formatDate(prepScholarship.decisionDate) : "Not recorded"}</b>
              </p>
              {!["Submitted", "Awarded", "Rejected"].includes(prepScholarship.applicationStatus || "Not started") && (
                <button type="button" className="primary" onClick={markPrepScholarshipSubmitted}>Record as submitted</button>
              )}
              <small className="deadline-footnote">To record an award or decision date, edit the scholarship's application status in the tracker. Keep official confirmation from the sponsor.</small>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
