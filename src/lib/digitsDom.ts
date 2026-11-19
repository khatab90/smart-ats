import { toArabicDigits } from "./digits";

/**
 * Shows every number on screen in Arabic-Indic digits, including fixed texts
 * ("آخر 3 دقائق", hints, notification bodies), by converting text nodes as
 * React writes them. React never reads text back from the page, so this is
 * safe: when it updates a text, the new value is converted again.
 *
 * Left untouched: inputs, anything inside [data-latin], and numbers that are
 * part of identifiers (see toArabicDigits).
 */
const SKIP = "[data-latin],script,style,textarea,input";

function convertText(node: Text) {
  if (node.parentElement?.closest(SKIP)) return;
  const next = toArabicDigits(node.data);
  if (next !== node.data) node.data = next;
}

function convertTree(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) return convertText(node as Text);
  if (node.nodeType !== Node.ELEMENT_NODE || (node as Element).closest(SKIP)) return;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) convertText(n as Text);
}

/** Starts converting under `root`; returns a function that stops it. */
export function startArabicDigits(root: Node = document.body): () => void {
  convertTree(root);
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "characterData") convertTree(m.target);
      else m.addedNodes.forEach(convertTree);
    }
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true });
  return () => observer.disconnect();
}
