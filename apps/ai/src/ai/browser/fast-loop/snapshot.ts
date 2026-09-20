// The page as the classifier sees it: visible controls with stable node ids,
// visible text, and a freshness marker. Ported from browser-use/jev-ultrafast
// `snapshot.js` (MIT, Copyright (c) 2026 Browser Use) — kept verbatim on
// purpose (PLAN-browser-fast-loop.md D4): the limits (250 actions, 6000
// chars of text), the visible-only filter and the marker are what make a
// classifier's answer safe to execute.
//
// Node identity lives in the page (`window.__jevFast`), so a decision refers
// to an element the page itself handed out — never to a selector the model
// wrote.

export interface SnapshotRect {
  h: number;
  w: number;
  x: number;
  y: number;
}

export type SnapshotActionKind =
  | "click"
  | "fill"
  | "select"
  | "scroll"
  | "wait";

export interface SnapshotAction {
  checked?: string;
  /** Selected options' labels — `select` actions only. */
  current_value?: string;
  /** Scroll actions only. */
  delta?: number;
  expanded?: string;
  /** `e1`…`e250`, `scroll_up`, `scroll_down`, `wait`. */
  id: string;
  kind: SnapshotActionKind;
  label: string;
  /** Page-owned element id; absent for scroll/wait. */
  node?: number;
  rect?: SnapshotRect;
  role?: string;
  selected?: string;
  value?: string;
}

export interface PageSnapshot {
  actions: SnapshotAction[];
  /** sha256 of url/text/actions/scroll — "did the page change". */
  fingerprint: string;
  /** Per-node semantic guard, keyed by node id as a string. */
  guards: Record<string, unknown>;
  h: number;
  marker: unknown;
  omitted_actions: number;
  page_key: unknown;
  scroll: { height: number; y: number };
  text: string;
  title: string;
  url: string;
  w: number;
}

/** The whole observation, as one expression. */
export const SNAPSHOT_SCRIPT = String.raw`(() => {
  if (!document.body) return null;
  const cache = window.__jevFast ||= {ids:new WeakMap(), nodes:new Map(), next:1};
  const identity = e => {
    if (!cache.ids.has(e)) cache.ids.set(e,cache.next++);
    const id=cache.ids.get(e); cache.nodes.set(id,e); return id;
  };
  for (const [id,e] of cache.nodes) if (!e.isConnected) cache.nodes.delete(id);
  const safe = e => !['password','file','hidden'].includes(e.type);
  const visible = e => !e.closest('[aria-hidden="true"],[inert]') &&
    e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});
  const name = (e,seen=new Set()) => {
    if (!e || seen.has(e)) return '';
    seen.add(e);
    const referenced=(e.getAttribute('aria-labelledby')||'').split(/\s+/)
      .map(id=>name(document.getElementById(id),seen)).filter(Boolean).join(' ');
    return referenced || e.getAttribute('aria-label') ||
      [...(e.labels||[])].map(l=>name(l,seen)).filter(Boolean).join(' ') ||
      (['button','submit','reset'].includes(e.type) ? e.value : '') || e.getAttribute('alt') ||
      (e.tagName==='INPUT' ? '' : [...e.childNodes].map(n=>n.nodeType===3 ? n.textContent :
        n.nodeType===1 && n.getAttribute('aria-hidden')!=='true' ? name(n,seen) : '').join(' ').trim()) ||
      e.getAttribute('title') || e.getAttribute('placeholder') || '';
  };
  const roles=['button','link','checkbox','radio','switch','tab','menuitem','menuitemradio',
    'option','gridcell','combobox','textbox','searchbox','spinbutton'];
  const selector='a[href],button,input,textarea,select,summary,[contenteditable="true"],'+
    roles.map(role=>'[role="'+role+'"]').join(',');
  const role = e => {
    const explicit=e.getAttribute('role');
    if (roles.includes(explicit)) return explicit;
    if (e.tagName==='BUTTON' || e.tagName==='SUMMARY') return 'button';
    if (e.tagName==='A') return 'link';
    if (e.tagName==='SELECT') return 'combobox';
    if (e.tagName==='TEXTAREA' || e.isContentEditable) return 'textbox';
    if (e.tagName==='INPUT') {
      if (['checkbox','radio'].includes(e.type)) return e.type;
      if (['button','submit','reset','image'].includes(e.type)) return 'button';
      if (e.type==='search') return 'searchbox';
      if (e.type==='number') return 'spinbutton';
      if (['text','email','url','tel'].includes(e.type)) return 'textbox';
    }
    return null;
  };
  cache.pageKey=()=>[performance.timeOrigin,location.href,scrollX,scrollY,innerWidth,innerHeight,
    [...document.querySelectorAll('input,textarea,select')].filter(safe)
      .map(e=>[identity(e),e.value,e.checked,e.selectedIndex,e.disabled,e.readOnly])];
  cache.guard=e=>{
    if (!e?.isConnected || !visible(e)) return null;
    const scope=e.closest('form,dialog,[role="dialog"],article,li,tr,[role="row"]') || e.parentElement;
    return [identity(e),role(e),name(e),e.value??null,e.checked??null,e.selectedIndex??null,
      e.readOnly??null,e.matches(':disabled'),e.getAttribute('aria-disabled'),
      e.getAttribute('aria-expanded'),e.getAttribute('aria-checked'),e.getAttribute('aria-selected'),
      e.getAttribute('href'),scope?.innerText?.slice(0,6000)||''];
  };
  const actions=[];
  for (const e of document.querySelectorAll(selector)) {
    if (!safe(e) || !visible(e) || e.matches(':disabled') || e.closest('[aria-disabled="true"]')) continue;
    const r=e.getBoundingClientRect(), x=r.x+r.width/2, y=r.y+r.height/2, rname=role(e);
    if (!rname || r.width<=0 || r.height<=0 || x<0 || y<0 || x>=innerWidth || y>=innerHeight) continue;
    if (rname==='gridcell' && e.querySelector('button,[role="button"]')) continue;
    const base={node:identity(e),role:rname,label:name(e)||rname,
      rect:{x:r.x,y:r.y,w:r.width,h:r.height}};
    for (const key of ['checked','selected','expanded']) {
      const value=e.getAttribute('aria-'+key);
      if (value!==null) base[key]=value;
    }
    if (['checkbox','radio'].includes(e.type)) base.checked=String(e.checked);
    if (e.tagName==='SELECT') {
      for (const o of e.options) if (!o.selected && !o.disabled && !o.closest('optgroup[disabled]'))
        actions.push({...base,kind:'select',value:o.value,
          current_value:[...e.selectedOptions].map(o=>o.label).join(', '),label:base.label+' → '+o.label});
    } else {
      const editable=!e.readOnly && e.getAttribute('aria-readonly')!=='true' &&
        (['textbox','searchbox','spinbutton'].includes(rname) ||
          (rname==='combobox' && ['INPUT','TEXTAREA'].includes(e.tagName)));
      const value='value' in e ? String(e.value) :
        e.isContentEditable || rname==='combobox' ? e.innerText.trim() : '';
      actions.push({...base,kind:editable?'fill':'click',value});
      if (editable) actions.push({...base,kind:'click',value,label:'Open '+base.label});
    }
  }
  const words=[], walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  const range=document.createRange(); let node,length=0;
  while ((node=walker.nextNode()) && length<6000) {
    const value=node.textContent.trim(), parent=node.parentElement;
    if (!value || !parent || parent.closest('script,style,noscript,template') || !visible(parent)) continue;
    range.selectNodeContents(node); const r=range.getBoundingClientRect();
    if (r.width>0 && r.height>0 && r.bottom>0 && r.top<innerHeight && r.right>0 && r.left<innerWidth) {
      words.push(value); length+=value.length;
    }
  }
  const text=words.join('\n').slice(0,6000), height=document.documentElement.scrollHeight;
  const page_key=cache.pageKey(), guards={};
  for (const a of actions) if (!(a.node in guards)) guards[a.node]=cache.guard(cache.nodes.get(a.node));
  // Compare meaning and identity. Geometry is always resolved and hit-tested just before input.
  const semantics=actions.map(({rect,...action})=>action);
  const marker=[performance.timeOrigin,location.href,scrollX,scrollY,innerWidth,innerHeight,
    document.title,text,semantics,page_key[6]];
  const omitted_actions=Math.max(0,actions.length-250);
  actions.splice(250);
  actions.forEach((a,i)=>a.id='e'+(i+1));
  if (scrollY+innerHeight<height-2) actions.push({id:'scroll_down',kind:'scroll',label:'Scroll down',delta:560});
  if (scrollY>0) actions.push({id:'scroll_up',kind:'scroll',label:'Scroll up',delta:-560});
  actions.push({id:'wait',kind:'wait',label:'Wait for the page to update'});
  return {url:location.href,title:document.title,w:innerWidth,h:innerHeight,text,
    scroll:{y:scrollY,height},actions,marker,page_key,guards,omitted_actions};
})()`;

/** Just the freshness marker — cheaper than a full observation. */
export const MARKER_SCRIPT = `(() => { const state=${SNAPSHOT_SCRIPT}; return state?.marker ?? null; })()`;

/** The page key plus one node's guard: is this exact element still what we saw. */
export function nodeGuardScript(node: number): string {
  return `(() => { const c=window.__jevFast; return c ? [c.pageKey(),c.guard(c.nodes.get(${node}))] : null; })()`;
}

/**
 * Resolve an observed node to a click point RIGHT before input: still
 * attached, enabled, visible, inside the viewport, and the top-most element
 * at its centre (occlusion). For `select`, also apply the value here — a
 * native <select> takes no synthetic click. Returns null when any check
 * fails, which the driver reports as a stale page.
 */
export function actTargetScript(action: SnapshotAction): string {
  return `(action => {
  const e=window.__jevFast?.nodes.get(action.node);
  if (!e?.isConnected || e.matches(':disabled') || e.closest('[aria-disabled="true"],[inert]') ||
      !e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})) return null;
  if (action.kind==='fill' && (e.readOnly || e.getAttribute('aria-readonly')==='true')) return null;
  const r=e.getBoundingClientRect(), x=r.x+r.width/2, y=r.y+r.height/2;
  if (!r.width || !r.height || x<0 || y<0 || x>=innerWidth || y>=innerHeight) return null;
  if (!e.contains(document.elementFromPoint(x,y))) return null;
  if (action.kind==='select') {
    if (e.tagName!=='SELECT' || ![...e.options].some(o=>o.value===action.value &&
        !o.disabled && !o.closest('optgroup[disabled]'))) return null;
    e.value=action.value;
    e.dispatchEvent(new Event('input',{bubbles:true}));
    e.dispatchEvent(new Event('change',{bubbles:true}));
  }
  return {x,y};
})(${JSON.stringify({ kind: action.kind, node: action.node, value: action.value ?? null })})`;
}

/** No DOM mutation for this long counts as the page having settled. */
export const SETTLE_QUIET_MS = 100;
/** Longest a settle waits; a page that never goes quiet is observed anyway. */
export const SETTLE_CAP_MS = 1500;

/**
 * Wait for the page to come to rest before the next observation: at least
 * two animation frames, then no DOM mutation for `SETTLE_QUIET_MS` and no
 * finite CSS/Web animation still running (a re-rendering calendar, a dialog
 * sliding in — a spinner's infinite animation is ignored). After typing into
 * an autocomplete, also wait for its options to be visible. `action` is null
 * when settling without a preceding input (a stale retry). Capped at
 * `SETTLE_CAP_MS` so a busy page never stalls the loop.
 */
export function settleScript(action: SnapshotAction | null): string {
  return `(action => new Promise(resolve => {
  const field=action.node===null ? null : window.__jevFast?.nodes.get(action.node);
  const autocomplete=action.kind==='fill' && field?.getAttribute('role')==='combobox';
  let frames=0, stopped=false, lastMutation=performance.now();
  const observer=new MutationObserver(()=>{lastMutation=performance.now()});
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});
  const finish=()=>{if(stopped)return;stopped=true;observer.disconnect();resolve(true)};
  setTimeout(finish,${SETTLE_CAP_MS});
  const optionsVisible=()=>{
    const ids=(field?.getAttribute('aria-controls')||field?.getAttribute('aria-owns')||'')
      .split(/\\s+/).filter(Boolean);
    const roots=ids.length ? ids.map(id=>document.getElementById(id)).filter(Boolean) : [document];
    return roots.flatMap(root=>[...root.querySelectorAll('[role="option"]')]).some(e=>{
      const r=e.getBoundingClientRect();
      return r.width && r.height && r.bottom>0 && r.top<innerHeight &&
        e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});
    });
  };
  const animating=()=>document.getAnimations().some(a=>
    a.playState==='running' && a.effect?.getTiming?.().iterations!==Infinity);
  const ready=()=>{
    if (stopped) return;
    const quiet=performance.now()-lastMutation>=${SETTLE_QUIET_MS} && !animating();
    if (++frames>=2 && quiet && (!autocomplete || optionsVisible())) finish();
    else requestAnimationFrame(ready);
  };
  requestAnimationFrame(ready);
}))(${JSON.stringify({ kind: action?.kind ?? null, node: action?.node ?? null })})`;
}
