export const editorStyles = `
:host{display:block;container-type:inline-size;color:var(--primary-text-color,#222);font:14px/1.45 system-ui}
*{box-sizing:border-box}[hidden]{display:none!important}
.editor-section{border:1px solid var(--divider-color,#8886);border-radius:12px;padding:16px;margin:0 0 16px;background:var(--ha-card-background,var(--card-background-color,#fff));min-width:0}
h3,summary{font-size:16px;font-weight:650;margin:0 0 12px}summary{cursor:pointer;margin:0;min-height:28px}details[open]>summary{margin-bottom:12px}
p{margin:8px 0}.help,.editor-section>p{font-size:12px;line-height:1.5;color:var(--secondary-text-color,#657080)}.help{margin:0 0 12px}.grid>p{grid-column:1/-1;font-size:12px;color:var(--secondary-text-color,#657080);margin:0}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:end}.wide{grid-column:1/-1}
.field{display:flex;flex-direction:column;justify-content:flex-end;gap:6px;min-width:0;margin:0}.field>span{line-height:1.35}
input,select,button{font:inherit;padding:10px 12px;border:1px solid var(--input-idle-line-color,var(--divider-color,#8887));border-radius:8px;background:var(--input-fill-color,var(--ha-card-background,var(--card-background-color,#fff)));color:var(--input-ink-color,var(--primary-text-color,#222));min-width:0;min-height:44px}
input,select{width:100%}input[type=color]{padding:4px;height:44px}
input:focus-visible,select:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid var(--primary-color,#148aa8);outline-offset:3px}
button{cursor:pointer}button:disabled{opacity:.4;cursor:default}
.switch-list{margin-top:14px}.toggle-row{display:flex;position:relative;align-items:center;justify-content:space-between;gap:16px;min-height:56px;margin:0;padding:12px 0;border-bottom:1px solid var(--divider-color,#8884);cursor:pointer}.toggle-row:last-child{border-bottom:0}.toggle-row>span:first-child{min-width:0}
.switch-input{position:absolute;inset-inline-end:0;top:50%;transform:translateY(-50%);width:44px;height:44px;opacity:0;margin:0;cursor:pointer}
.switch-track{position:relative;display:block;width:44px;height:26px;flex:0 0 44px;border-radius:20px;background:var(--switch-unchecked-track-color,var(--disabled-color,#89929b));pointer-events:none;transition:background .15s}
.switch-track::after{content:"";position:absolute;left:3px;top:3px;width:20px;height:20px;border-radius:50%;background:var(--switch-unchecked-button-color,#fff);box-shadow:0 1px 3px #0003;transition:transform .15s}
.switch-input:checked+.switch-track{background:var(--switch-checked-track-color,var(--primary-color,#148aa8))}.switch-input:checked+.switch-track::after{transform:translateX(18px);background:var(--switch-checked-button-color,#fff)}.switch-input:focus-visible+.switch-track{outline:2px solid var(--primary-color,#148aa8);outline-offset:4px}
.sequence-entry{border:1px solid var(--divider-color,#8886);border-radius:10px;margin:0 0 14px;padding:12px;min-width:0}.sequence-entry legend{padding:0 6px;font-weight:600}.drag-handle{cursor:grab;touch-action:none;user-select:none;width:44px;height:44px;padding:0;margin-right:8px;vertical-align:middle}.dragging{opacity:.5}.drop-before{box-shadow:0 -3px var(--primary-color,#148aa8)}.drop-after{box-shadow:0 3px var(--primary-color,#148aa8)}
.phase-fields{grid-template-columns:minmax(0,1fr) minmax(110px,.6fr) 72px}.sound-fields{grid-template-columns:minmax(0,1fr)}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.actions button{padding:8px 12px}.actions .move{width:44px;padding:0;font-size:18px}.actions .remove{margin-inline-start:auto;color:var(--error-color,#c44)}.sequence-add{margin:0}.sequence-add button{border-color:var(--primary-color,#148aa8);font-weight:600}
.translations-fields{border:0;margin:0;padding:0}.sequence-warning{color:var(--warning-color,#b57900);font-size:12px}.sequence-warning:empty,.error:empty{display:none}.error{color:var(--error-color,#d44);font-size:13px}
.preview{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8;background:var(--secondary-background-color,#8881);padding:12px;border-radius:8px}
@container(max-width:520px){.phase-fields{grid-template-columns:minmax(0,1fr) 72px}.phase-fields>.field:first-child{grid-column:1/-1}}
@container(max-width:480px){.grid:not(.phase-fields):not(.sound-fields){grid-template-columns:minmax(0,1fr)}.editor-section{padding:14px}.actions{gap:6px}.actions button{padding:8px 10px}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important}}
`;
