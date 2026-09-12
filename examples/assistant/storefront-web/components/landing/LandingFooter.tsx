import { Arrow } from "../SiteChrome";

/**
 * Closing statement + departure form — oversized type pair framing the
 * trip input, in place of the old radar terminal.
 */
export function LandingFooter() {
  return (
    <section className="outro-section" aria-label="出发">
      <h2 className="outro-title" data-oval-title>
        准备
        <br />
        <em>出发。</em>
      </h2>

      <form action="/chat" className="outro-form">
        <label htmlFor="outro-draft">你的下一程，说给助手听。</label>
        <div className="outro-field">
          <input
            id="outro-draft"
            name="draft"
            maxLength={1200}
            required
            placeholder="例如：两人周末自驾露营，预算 2000 元…"
          />
          <button type="submit" aria-label="带着行程进入助手">
            <Arrow />
          </button>
        </div>
      </form>
    </section>
  );
}
