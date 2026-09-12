import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { AboutSheet, CaseDrawer, ConsentGate, ScaleModal, Sheet, SupportSheet } from "./overlays";
import { Composer, PrivacyRibbon, TopBar, Welcome } from "./chat-parts";
import { personaById } from "./data";

const noop = () => {};
const persona = personaById("linxi");

describe("interactive component accessibility", () => {
  for (const example of [
    { name: "sheet", view: () => <Sheet label="Local records" onClose={noop}><h2>Local records</h2><button>Close</button></Sheet> },
    { name: "first-use disclosure", view: () => <ConsentGate lang="zh" ageRange="minor" onAccept={noop} /> },
    { name: "about and backup", view: () => <AboutSheet lang="en" companion={persona} onClose={noop} onExportData={noop} onImportData={noop} /> },
    { name: "self-check", view: () => <ScaleModal lang="zh" scaleId="PHQ-9" onClose={noop} /> },
    { name: "understanding", view: () => <CaseDrawer lang="en" onClose={noop} onChange={noop} error="Please try again" onRetry={noop} /> },
    { name: "human support", view: () => <SupportSheet lang="zh" region="CN" onClose={noop} /> }
  ]) {
    it(`gives ${example.name} valid names, roles and form relationships`, async () => {
      render(example.view());
      const result = await axe.run(screen.getByRole("dialog"), {
        rules: { "color-contrast": { enabled: false } }
      });
      expect(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
    });
  }

  it("provides named controls on the initial page and composer", async () => {
    const { container } = render(<main>
      <TopBar lang="zh" theme="light" persona={persona} onTheme={noop} onLang={noop} onPersona={noop} onCase={noop} onSupport={noop} />
      <PrivacyRibbon lang="zh" onDelete={noop} />
      <Welcome lang="zh" companion={persona} onStart={noop} />
      <Composer lang="zh" pace="fast" busy={false} onSend={vi.fn()} onPace={noop} />
    </main>);
    const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
  });
});
