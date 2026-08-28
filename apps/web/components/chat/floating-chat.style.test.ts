import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('floating chat accessibility style contract', () => {
  const css = readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');

  it('keeps contact and message action hit areas at least 44 by 44 pixels', () => {
    const actionRule = css.slice(
      css.indexOf('.floating-chat__contact-actions,\n.floating-chat__message-actions'),
      css.indexOf('.floating-chat__contact-actions:hover'),
    );
    expect(actionRule).toContain('width: 44px');
    expect(actionRule).toContain('height: 44px');
    expect(actionRule).toContain('min-width: 44px');
  });

  it('provides reduced-motion and scrollable message rules', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    const messageRule = css.slice(
      css.indexOf('.floating-chat__messages {'),
      css.indexOf('.floating-chat__history-skeleton'),
    );
    expect(messageRule).toContain('overflow-y: auto');
    expect(messageRule).not.toContain('overflow-x: scroll');
  });

  it('keeps reply attribution plain and anchors actions to the replied message row', () => {
    const attributionRule = css.slice(
      css.indexOf('.floating-chat__reply-attribution {'),
      css.indexOf('.floating-chat__reply-attribution>span'),
    );
    expect(attributionRule).toContain('background: transparent');

    const mainRowRule = css.slice(
      css.indexOf('.floating-chat__message-main-row {'),
      css.indexOf('.floating-chat__message-line .floating-chat__message-actions'),
    );
    expect(mainRowRule).toContain('position: relative');
    expect(mainRowRule).toContain('z-index: 1');
    expect(mainRowRule).toContain('display: inline-flex');

    const replyOverlapRule = css.slice(
      css.indexOf('.floating-chat__reply-quote~.floating-chat__message-main-row {'),
      css.indexOf('.floating-chat__message-line .floating-chat__message-actions'),
    );
    expect(replyOverlapRule).toContain('margin-top: -0.65rem');

    const messageMenuRule = css.slice(
      css.indexOf('.floating-chat__message-menu {'),
      css.indexOf('.floating-chat__message-line.is-theirs .floating-chat__message-menu'),
    );
    expect(messageMenuRule).toContain('top: auto');
    expect(messageMenuRule).toContain('bottom: calc(100% + 4px)');
  });
});
