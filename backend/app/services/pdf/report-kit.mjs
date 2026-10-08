// ../../scripts/export-report-pdf.ts
import { readFileSync } from "node:fs";

// ../shared/report-kit/dictionary.ts
var CORE_METRIC_DICTIONARY = {
  stress_load: {
    name: "\u538B\u529B/\u5524\u9192\u8D1F\u8377",
    plainMeaning: "\u53CD\u6620\u6D4B\u8BC4\u671F\u95F4\u77ED\u65F6\u538B\u529B\u3001\u7D27\u5F20\u3001\u5174\u594B\u548C\u52A8\u4F5C\u6D3B\u8DC3\u5171\u540C\u5F62\u6210\u7684\u8D1F\u8377\u72B6\u6001\u3002",
    aviationMeaning: "\u6709\u52A9\u4E8E\u89C2\u5BDF\u65F6\u95F4\u538B\u529B\u3001\u4EFB\u52A1\u5BC6\u5EA6\u6216\u7A81\u53D1\u60C5\u5883\u4E0B\u7684\u5373\u65F6\u6FC0\u6D3B\u7A0B\u5EA6\u3002",
    limitation: "\u9AD8\u503C\u4E5F\u53EF\u80FD\u6765\u81EA\u5174\u594B\u3001\u52A8\u4F5C\u6216\u91C7\u96C6\u5E72\u6270\uFF0C\u4E0D\u7B49\u540C\u4E8E\u7126\u8651\u75C7\uFF0C\u4E5F\u4E0D\u80FD\u5355\u72EC\u5224\u65AD\u5DE5\u4F5C\u80FD\u529B\u3002",
    recommendation: "\u7ED3\u5408\u8FD1\u671F\u4F5C\u606F\u3001\u7761\u7720\u548C\u4EFB\u52A1\u538B\u529B\u590D\u6838\uFF1B\u6301\u7EED\u504F\u79BB\u65F6\u5EFA\u8BAE\u5728\u76F8\u8FD1\u6761\u4EF6\u4E0B\u590D\u6D4B\u3002",
    direction: "higher_load"
  },
  fatigue_recovery: {
    name: "\u75B2\u52B3/\u6062\u590D\u8D1F\u8377",
    plainMeaning: "\u53CD\u6620\u75B2\u52B3\u3001\u4F4E\u6D3B\u52A8\u53CA\u6062\u590D\u4E0D\u8DB3\u7B49\u72B6\u6001\u7EBF\u7D22\u3002",
    aviationMeaning: "\u75B2\u52B3\u53EF\u80FD\u5F71\u54CD\u6301\u7EED\u6CE8\u610F\u3001\u53CD\u5E94\u901F\u5EA6\u548C\u4EFB\u52A1\u5904\u7406\u7A33\u5B9A\u6027\uFF0C\u5E94\u7ED3\u5408\u8FD1\u671F\u4F5C\u606F\u4E0E\u4F11\u606F\u60C5\u51B5\u67E5\u770B\u3002",
    limitation: "\u4E00\u6B21\u77ED\u89C6\u9891\u53EA\u80FD\u53CD\u6620\u6D4B\u8BC4\u65F6\u6BB5\u7EBF\u7D22\uFF0C\u4E0D\u80FD\u4EE3\u66FF\u7761\u7720\u8BB0\u5F55\u548C\u533B\u5B66\u8BC4\u4F30\u3002",
    recommendation: "\u7ED3\u5408\u7761\u7720\u548C\u8FD1\u671F\u5DE5\u4F5C\u8282\u594F\u89C2\u5BDF\uFF1B\u7ED3\u679C\u6301\u7EED\u504F\u79BB\u65F6\u5EFA\u8BAE\u4F11\u606F\u540E\u590D\u6D4B\u3002",
    direction: "higher_load"
  },
  physiological_arousal: {
    name: "\u751F\u7406\u5524\u9192\u7EBF\u7D22",
    plainMeaning: "\u7531\u5FC3\u7387\u3001\u547C\u5438\u3001\u9762\u90E8\u6D3B\u52A8\u548C\u8EAB\u4F53\u5FAE\u5C0F\u8FD0\u52A8\u7B49\u6570\u636E\u5F62\u6210\u7684\u6D4B\u8BD5\u65F6\u6BB5\u751F\u7406\u6FC0\u6D3B\u7EBF\u7D22\uFF1B\u8F83\u4F4E\u901A\u5E38\u8868\u793A\u5F53\u65F6\u8F83\u5B89\u9759\u3001\u653E\u677E\u3002",
    aviationMeaning: "\u5524\u9192\u6C34\u5E73\u4E0E\u65E5\u5E38\u8B66\u89C9\u548C\u72B6\u6001\u8C03\u8282\u6709\u5173\uFF0C\u4F46\u672C\u9879\u53EA\u53CD\u6620\u5B89\u9759\u5750\u59FF\u6D4B\u8BD5\u4E2D\u7684\u77ED\u65F6\u72B6\u6001\u3002",
    limitation: "\u672C\u9879\u662F\u8F85\u52A9\u7EBF\u7D22\uFF0C\u4E0D\u53C2\u4E0E\u98CE\u9669\u5173\u6CE8\u8BA1\u6570\uFF1BrPPG\u4E3A\u89C6\u9891\u4F30\u7B97\u4E14\u53C2\u8003\u6837\u672C\u6709\u9650\uFF0C\u4E0D\u80FD\u636E\u6B64\u5224\u65AD\u5F02\u5E38\u6216\u5C97\u4F4D\u80FD\u529B\u3002",
    recommendation: "\u7ED3\u5408\u4FE1\u53F7\u8D28\u91CF\u89E3\u8BFB\uFF1B\u8D28\u91CF\u4E0D\u8DB3\u6216\u7ED3\u679C\u6CE2\u52A8\u8F83\u5927\u65F6\u5E94\u6539\u5584\u91C7\u96C6\u6761\u4EF6\u540E\u590D\u6D4B\u3002",
    direction: "higher_load"
  },
  attention_focus: {
    name: "\u89C6\u89C9\u6CE8\u610F\u529B",
    plainMeaning: "\u53CD\u6620\u6D4B\u8BC4\u8FC7\u7A0B\u4E2D\u89C6\u89C9\u805A\u7126\u3001\u6CE8\u89C6\u7A33\u5B9A\u548C\u79BB\u5C4F\u60C5\u51B5\u5F62\u6210\u7684\u6CE8\u610F\u7EBF\u7D22\u3002",
    aviationMeaning: "\u4E0E\u6301\u7EED\u5173\u6CE8\u3001\u4FE1\u606F\u83B7\u53D6\u548C\u6CE8\u610F\u7A33\u5B9A\u6709\u5173\uFF0C\u662F\u65E5\u5E38\u4EFB\u52A1\u4E2D\u7684\u91CD\u8981\u89C2\u5BDF\u65B9\u5411\u3002",
    limitation: "\u666E\u901A\u6444\u50CF\u5934\u7ED3\u679C\u5C5E\u4E8E\u773C\u52A8\u4EE3\u7406\u4F30\u8BA1\uFF0C\u4E0D\u7B49\u540C\u4E8E\u7ECF\u8FC7\u6821\u51C6\u7684\u4E13\u4E1A\u773C\u52A8\u4EEA\u3002",
    recommendation: "\u7ED3\u5408\u773C\u52A8\u662F\u5426\u5B9E\u9645\u91C7\u96C6\u548C\u6570\u636E\u8D28\u91CF\u67E5\u770B\uFF1B\u672A\u91C7\u96C6\u65F6\u4E0D\u5F97\u4F9D\u636E\u9762\u90E8\u5C45\u4E2D\u63A8\u65AD\u6CE8\u610F\u529B\u3002",
    direction: "higher_better"
  }
};
var SCREENING_DICTIONARY = {
  depression: {
    name: "\u6291\u90C1\u65B9\u5411\u7B5B\u67E5",
    plainMeaning: "\u7528\u4E8E\u53D1\u73B0\u4E0E\u6291\u90C1\u65B9\u5411\u6709\u5173\u3001\u9700\u8981\u8FDB\u4E00\u6B65\u786E\u8BA4\u7684\u72B6\u6001\u7EBF\u7D22\u3002",
    aviationMeaning: "\u4EC5\u4F5C\u4E3A\u5FC3\u7406\u5065\u5EB7\u652F\u6301\u548C\u540E\u7EED\u590D\u6838\u7684\u8F85\u52A9\u4FE1\u606F\uFF0C\u4E0D\u7528\u4E8E\u81EA\u52A8\u4F5C\u51FA\u5C97\u4F4D\u51B3\u5B9A\u3002",
    limitation: "\u7B5B\u67E5\u7ED3\u679C\u4E0D\u662F\u4E34\u5E8A\u8BCA\u65AD\uFF1B\u65E0\u91CF\u8868\u65F6\u5C24\u5176\u9700\u8981\u7ED3\u5408\u8BBF\u8C08\u548C\u5B9E\u9645\u60C5\u5883\u3002",
    recommendation: "\u4EE5\u672C\u6B21\u7ED3\u679C\u5206\u7C7B\u4E3A\u51C6\uFF1B\u9700\u8981\u5173\u6CE8\u65F6\u8865\u5145\u6807\u51C6\u91CF\u8868\u6216\u4E13\u4E1A\u8BBF\u8C08\u3002",
    direction: "higher_load"
  },
  anxiety: {
    name: "\u7126\u8651\u65B9\u5411\u7B5B\u67E5",
    plainMeaning: "\u7528\u4E8E\u53D1\u73B0\u4E0E\u7126\u8651\u3001\u7D27\u5F20\u65B9\u5411\u6709\u5173\u3001\u9700\u8981\u8FDB\u4E00\u6B65\u786E\u8BA4\u7684\u72B6\u6001\u7EBF\u7D22\u3002",
    aviationMeaning: "\u53EF\u4F5C\u4E3A\u538B\u529B\u7BA1\u7406\u548C\u5FC3\u7406\u652F\u6301\u7684\u8F85\u52A9\u89C2\u5BDF\uFF0C\u4E0D\u76F4\u63A5\u4EE3\u8868\u5DE5\u4F5C\u80DC\u4EFB\u529B\u3002",
    limitation: "\u7B5B\u67E5\u7ED3\u679C\u4E0D\u662F\u4E34\u5E8A\u8BCA\u65AD\uFF0C\u4E0D\u80FD\u5199\u4F5C\u201C\u60A3\u6709\u7126\u8651\u201D\u3002",
    recommendation: "\u4EE5\u672C\u6B21\u7ED3\u679C\u5206\u7C7B\u4E3A\u51C6\uFF1B\u9700\u8981\u5173\u6CE8\u65F6\u7ED3\u5408\u91CF\u8868\u3001\u8BBF\u8C08\u548C\u8FD1\u671F\u538B\u529B\u4E8B\u4EF6\u590D\u6838\u3002",
    direction: "higher_load"
  }
};

// ../shared/report-kit/formatters.ts
function displayNumber(value, digits = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "\u2014";
}
function displayPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "\u2014";
  return `${(Math.abs(n) <= 1 ? n * 100 : n).toFixed(1)}%`;
}
function getAt(source2, path, fallback = null) {
  let current = source2;
  for (const key of path.split(".")) {
    if (current == null || typeof current !== "object" || !(key in current)) return fallback;
    current = current[key];
  }
  return current ?? fallback;
}

// ../shared/report-kit/mapping.ts
var tabKey = (tab) => tab === "eye" ? "eye_tracking" : tab;
var summaryOf = (report) => report.result?.summary_json || {};
var timelineOf = (report) => report.result?.timeline_json || {};
var REPORT_TABS = [
  { key: "overview", label: "\u7EFC\u5408\u6982\u89C8", kicker: "Page 01 \xB7 Result Overview", title: "\u672C\u6B21\u72B6\u6001\u4E0E\u590D\u6838\u91CD\u70B9", hint: "\u5148\u786E\u8BA4\u6570\u636E\u662F\u5426\u6709\u6548\u3001\u54EA\u4E9B\u7ED3\u679C\u7A33\u5B9A\u3001\u54EA\u4E9B\u9879\u76EE\u5EFA\u8BAE\u7ED3\u5408\u5B9E\u9645\u60C5\u51B5\u590D\u6838\u3002" },
  { key: "screening", label: "\u65B9\u5411\u7B5B\u67E5", kicker: "Page 02 \xB7 Screening", title: "\u6291\u90C1\u4E0E\u7126\u8651\u65B9\u5411\u7B5B\u67E5", hint: "\u5C55\u793A\u7B5B\u67E5\u5206\u6570\u3001\u7ED3\u679C\u5206\u7C7B\u3001\u7F6E\u4FE1\u5EA6\u548C\u4F7F\u7528\u9650\u5236\uFF1B\u7B5B\u67E5\u4E0D\u7B49\u4E8E\u8BCA\u65AD\u3002" },
  { key: "core", label: "\u6838\u5FC3\u72B6\u6001", kicker: "Page 03 \xB7 Core State", title: "\u6838\u5FC3\u5FC3\u7406\u751F\u7406\u72B6\u6001", hint: "\u9010\u9879\u89E3\u91CA\u538B\u529B\u3001\u75B2\u52B3\u3001\u751F\u7406\u5524\u9192\u4E0E\u89C6\u89C9\u6CE8\u610F\uFF0C\u5E76\u6807\u660E\u672C\u6B21\u7ED3\u679C\u7684\u6863\u4F4D\u4E0E\u53C2\u8003\u533A\u95F4\u3002" },
  { key: "evidence", label: "\u6570\u636E\u8BC1\u636E", kicker: "Page 04 \xB7 Data Evidence", title: "\u6570\u636E\u8D28\u91CF\u4E0E\u8F85\u52A9\u8BC1\u636E", hint: "\u5C55\u793A\u91C7\u96C6\u8D28\u91CF\u3001\u53EF\u7528\u7684\u751F\u7406\u8282\u5F8B\u4E0E\u89C6\u89C9\u6CE8\u610F\u8BC1\u636E\uFF0C\u5E76\u8BF4\u660E\u89E3\u91CA\u8FB9\u754C\u3002" }
];
function displayResultLabel(key, raw, severity) {
  const label = String(raw || "\u672A\u63D0\u4F9B");
  const lowRisk = Number(severity) === 0 || /参考范围|无明显风险/.test(label);
  if (key === "physiological_arousal" && /负荷较低|偏低/.test(label)) return "\u6B63\u5E38\uFF08\u4F4E\u8D1F\u8377\uFF09";
  if (key === "physiological_arousal" && lowRisk) return "\u6B63\u5E38";
  if (lowRisk && /参考范围|无明显风险|负荷较低/.test(label)) return "\u6B63\u5E38";
  return label;
}
var SPECS = {
  au: [["micro_expression_event_rate_per_min", "AU \u4E8B\u4EF6\u7387", "au_event_rate_per_min"], ["au_event_peak_intensity", "AU \u5CF0\u503C\u5F3A\u5EA6", "au_activity_score"], ["au_tension_event_rate_per_min", "AU \u7D27\u5F20\u4E8B\u4EF6\u7387", "tension_au_score"], ["au_low_activity_score", "\u4F4E\u6D3B\u52A8\u6BD4\u4F8B"], ["facial_variability", "\u9762\u90E8\u53D8\u5316\u5E45\u5EA6", "au_variability_score"]],
  rppg: [["hr_interval", "\u5FC3\u7387\u533A\u95F4"], ["hr_range", "\u5FC3\u7387\u53D8\u5E45"], ["hrv_rmssd_ms", "RMSSD"], ["hrv_sdnn_ms", "SDNN"], ["signal_quality", "\u4FE1\u53F7\u8D28\u91CF"], ["motion_noise_index", "\u8FD0\u52A8\u5E72\u6270"], ["light_noise_index", "\u5149\u7167\u5E72\u6270"]],
  vibra: [["vibra_positive_score", "\u6B63\u5411\u72B6\u6001\u7EBF\u7D22"], ["vibra_negative_score", "\u8D1F\u5411\u72B6\u6001\u7EBF\u7D22"], ["vibra_body_score", "\u8EAB\u4F53/\u751F\u7406\u8C03\u8282\u7EBF\u7D22"]],
  eye: [["attention_focus_score", "\u89C6\u89C9\u4E13\u6CE8\u5EA6"], ["attention_stability_score", "\u6CE8\u610F\u7A33\u5B9A\u6027"], ["gaze_valid_ratio", "\u6709\u6548\u773C\u52A8\u6BD4\u4F8B"], ["aoi_center_dwell_ratio", "\u4E2D\u5FC3\u5173\u6CE8\u6BD4\u4F8B"], ["fixation_ratio", "\u6CE8\u89C6\u505C\u7559\u6BD4\u4F8B"], ["gaze_entropy", "\u89C6\u7EBF\u79BB\u6563\u5EA6"], ["gaze_x_range", "\u6C34\u5E73\u79FB\u52A8\u8303\u56F4"], ["gaze_y_range", "\u5782\u76F4\u79FB\u52A8\u8303\u56F4"]]
};
function group(report, tab) {
  return getAt(summaryOf(report), `small_indicators.${tabKey(tab)}`, {}) || {};
}
function evidenceLabel(tab, key, item, rawLevel) {
  const direction = String(item?.direction || "");
  if (tab === "eye") {
    const focused = direction === "higher_more_focused" || ["attention_focus_score", "attention_stability_score", "gaze_valid_ratio", "aoi_center_dwell_ratio", "fixation_ratio"].includes(key);
    const unstable = direction === "higher_more_unstable" || ["gaze_entropy", "gaze_x_range", "gaze_y_range"].includes(key);
    if (focused) {
      if (/偏低|低/.test(rawLevel)) return "\u504F\u4F4E";
      return "\u7A33\u5B9A/\u826F\u597D";
    }
    if (unstable) {
      if (/偏高|高/.test(rawLevel)) return "\u89C6\u7EBF\u8F83\u5206\u6563";
      return "\u6B63\u5E38";
    }
  }
  if (tab === "rppg" && key === "signal_quality") {
    if (/偏低|低/.test(rawLevel)) return "\u9700\u8C28\u614E";
    return "\u826F\u597D";
  }
  if (tab === "rppg" && ["motion_noise_index", "light_noise_index"].includes(key)) {
    const numeric = Number(item?.value ?? item?.raw_value ?? item?.score_0_100 ?? item?.score);
    if (Number.isFinite(numeric)) {
      if (numeric < 0.3) return "\u5E72\u6270\u8F83\u4F4E";
      if (numeric >= 0.6) return "\u5E72\u6270\u8F83\u9AD8";
      return "\u5E72\u6270\u4E2D\u7B49";
    }
    return "\u5E72\u6270\u5F85\u786E\u8BA4";
  }
  if (tab === "au" || tab === "vibra" || tab === "rppg" && ["hr_range", "hrv_rmssd_ms", "hrv_sdnn_ms"].includes(key)) return "\u8F85\u52A9\u89C2\u5BDF";
  return displayResultLabel(key, rawLevel, item?.level?.severity);
}
function metric(source2, keys, name, tab) {
  const raw = keys.map((key) => source2[key]).find((value2) => value2 != null);
  const item = raw && typeof raw === "object" ? raw : { value: raw };
  const value = item?.value ?? item?.raw_value ?? item?.mean ?? item?.score_0_100 ?? item?.score;
  const unit = item?.unit || "";
  const rawLevel = item?.level?.label || item?.classification_label || item?.grade_label || "\u672A\u63D0\u4F9B";
  return { key: keys[0], name, value: unit === "ratio" || unit === "prob" ? displayPercent(value) : displayNumber(value), level: evidenceLabel(tab, keys[0], item, String(rawLevel)), unit };
}
function pageMetrics(report, tab) {
  const source2 = group(report, tab);
  return SPECS[tab].map(([key, name, fallback]) => metric(source2, [key, fallback].filter(Boolean), name, tab));
}
function rppgAvailable(report) {
  const summary = summaryOf(report), timeline = timelineOf(report);
  const value = getAt(timeline, "display_payload.rppg_waveforms.quality_gate.physiology_available", getAt(summary, "rppg_quality_gate.physiology_available", getAt(summary, "quality.rppg_window_usable", null)));
  return value === true || value == null && pageMetrics(report, "rppg").some((item) => item.value !== "\u2014");
}
function rppgReasons(report) {
  const gate = getAt(summaryOf(report), "rppg_quality_gate", {}) || {};
  const reasons = gate.unavailable_reasons || gate.reasons || [];
  const joined = Array.isArray(reasons) ? reasons.filter(Boolean).join("\uFF1B") : String(reasons || "");
  return /[一-鿿]/.test(joined) ? joined : "";
}
function eyeData(report) {
  return getAt(timelineOf(report), "display_payload.eye_tracking", {}) || {};
}
function eyeAvailable(report) {
  const eye = eyeData(report), small = group(report, "eye");
  const status = eye.status || getAt(summaryOf(report), "modules.eye_tracking.status", getAt(summaryOf(report), "quality.eye_tracking_status", ""));
  return !/not_collected|unavailable|missing/i.test(String(status)) && (!!eye.metrics || Array.isArray(eye.gaze_points) && eye.gaze_points.length > 0 || Object.keys(small).length > 0);
}
function thresholdText(thresholds, direction) {
  if (thresholds.length !== 4) return "\u672C\u6B21\u7ED3\u679C\u672A\u63D0\u4F9B\u56FA\u5B9A\u6570\u503C\u5206\u6863\uFF0C\u4EE5\u7ED3\u679C\u6863\u4F4D\u4E3A\u51C6";
  const [a, b, c, d] = thresholds.map(Number);
  const labels = direction === "higher_better" ? ["\u4F4E", "\u504F\u4F4E", "\u6B63\u5E38\uFF08\u7B2C3\u6863\uFF09", "\u6B63\u5E38\uFF08\u7B2C4\u6863\uFF09", "\u6B63\u5E38\uFF08\u7B2C5\u6863\uFF09"] : ["\u660E\u663E\u504F\u4F4E", "\u504F\u4F4E", "\u53C2\u8003\u8303\u56F4", "\u504F\u9AD8", "\u660E\u663E\u504F\u9AD8"];
  return `<${a} ${labels[0]}\uFF1B${a}\u2013<${b} ${labels[1]}\uFF1B${b}\u2013<${c} ${labels[2]}\uFF1B${c}\u2013<${d} ${labels[3]}\uFF1B\u2265${d} ${labels[4]}`;
}
function detailedMetric(key, item, definition, scene) {
  const thresholds = Array.isArray(item.grade_thresholds) ? item.grade_thresholds.map(Number).filter(Number.isFinite) : [];
  const score = item.grade_source_score ?? item.raw_score ?? item.score;
  const reference = item.reference_range || item.audit?.reference_range || {};
  const n = Number(reference.n);
  const weakReference = item.reliability === "weak_reference" || Number.isFinite(n) && n < Number(reference.weak_reference_min_n || 20);
  const originalLevel = item.classification_label || item.grade_label || item.level?.label || "\u672A\u63D0\u4F9B";
  return {
    key,
    name: item.name || definition.name,
    technicalName: key,
    score: Number.isFinite(Number(score)) ? Number(score) : null,
    level: displayResultLabel(key, originalLevel, item.level?.severity),
    originalLevel,
    severity: item.level?.severity != null ? Number(item.level.severity) : null,
    riskBand: item.risk_band != null ? String(item.risk_band) : null,
    grade: item.grade_display || (item.grade_1_5 ? `${item.grade_1_5}\u6863` : "\u672A\u63D0\u4F9B"),
    thresholds,
    referenceText: thresholdText(thresholds, definition.direction),
    definition: item.interpretation || definition.plainMeaning,
    plainMeaning: definition.plainMeaning,
    aviationMeaning: scene === "community" ? definition.plainMeaning : definition.aviationMeaning,
    limitation: definition.limitation,
    recommendation: definition.recommendation,
    confidence: item.classification_confidence_label || item.confidence?.level?.label || "\u672A\u63D0\u4F9B",
    direction: definition.direction,
    source: item.source || reference.source || "\u5206\u6790\u7ED3\u679C",
    weakReference
  };
}
function coreMetricViews(report) {
  const core = getAt(summaryOf(report), "core_indicators", {}) || {};
  return Object.entries(CORE_METRIC_DICTIONARY).map(([key, definition]) => {
    const view = detailedMetric(key, core[key] || {}, definition, report.scene);
    if (key === "physiological_arousal") view.name = definition.name;
    if (key === "attention_focus" && !eyeAvailable(report)) {
      view.score = null;
      view.level = "\u672A\u91C7\u96C6";
      view.grade = "\u4E0D\u5EFA\u8BAE\u89E3\u91CA";
      view.referenceText = "\u672C\u6B21\u672A\u91C7\u96C6\u53EF\u7528\u4E8E\u6B63\u5F0F\u89E3\u91CA\u7684\u773C\u52A8\u6570\u636E";
    }
    return view;
  });
}
function screeningMetricViews(report) {
  const screening = getAt(summaryOf(report), "clinical_screening", {}) || {};
  return Object.entries(SCREENING_DICTIONARY).map(([key, definition]) => {
    const item = screening[key] || {};
    const view = detailedMetric(key, item, definition, report.scene);
    view.name = item.name || definition.name;
    view.technicalName = `clinical_screening.${key}`;
    view.thresholds = [0, 50, 70, 100];
    view.grade = "\u65B9\u5411\u7B5B\u67E5\u5206\u7C7B";
    view.referenceText = "0\u2013<50 \u65E0\u660E\u663E\u98CE\u9669\uFF1B50\u2013<70 \u9700\u91CF\u8868\u786E\u8BA4\uFF1B70\u2013100 \u9AD8\u98CE\u9669\u5173\u6CE8";
    const classification = String(item.classification || "");
    view.riskBand = classification === "high_attention" ? "high" : classification === "low_review" ? "uncertain" : classification === "no_obvious_risk" ? "low" : view.riskBand;
    view.weakReference = item.reliability === "weak_reference";
    view.source = item.source || "\u65B9\u5411\u7B5B\u67E5\u7ED3\u679C";
    return view;
  });
}
function standardRangeText(item) {
  if (item.thresholds.length !== 4) return "\u672C\u6B21\u7ED3\u679C\u672A\u63D0\u4F9B\u56FA\u5B9A\u6570\u503C\u533A\u95F4";
  if (item.grade === "\u65B9\u5411\u7B5B\u67E5\u5206\u7C7B") return "0\u2013<50\uFF08\u65E0\u660E\u663E\u98CE\u9669\uFF09";
  const [, b, c] = item.thresholds;
  if (item.direction === "higher_better") return `${b}\u2013100`;
  const start = b, end = c;
  return `${start}\u2013<${end}`;
}
function hasPartnerThresholds(item) {
  return item.thresholds.length === 4 && item.thresholds.every(Number.isFinite);
}
function isScreeningRange(item) {
  return item.grade === "\u65B9\u5411\u7B5B\u67E5\u5206\u7C7B" && hasPartnerThresholds(item);
}
function resultOverview(report) {
  const metrics = [...coreMetricViews(report), ...screeningMetricViews(report)];
  const attention = metrics.filter(isAttentionMetric);
  const stable = metrics.filter(isStableMetric);
  return { metrics, attention, stable };
}
function isAttentionMetric(item) {
  if (/未采集|未提供|不建议解释/.test(item.level)) return false;
  if (item.key === "physiological_arousal") return false;
  if (item.severity != null) return item.severity >= 1;
  if (item.riskBand) return item.riskBand === "high";
  return /偏高|明显偏高|偏低|明显偏低|需.*确认|高风险|关注/.test(item.originalLevel || item.level);
}
function isStableMetric(item) {
  if (/未采集|未提供|不建议解释/.test(item.level)) return false;
  if (item.severity != null) return item.severity === 0;
  if (item.riskBand) return item.riskBand === "low" || item.riskBand === "uncertain";
  return /正常|参考范围|负荷较?低|负荷很低|未见明显风险/.test(item.originalLevel || item.level);
}
function dataQualityVerdict(report) {
  const confidence = getAt(summaryOf(report), "confidence", {}) || {};
  const levelKey = String(confidence.level?.key || "");
  const levelLabel = confidence.level?.label ? String(confidence.level.label) : null;
  const score = Number(confidence.score);
  const hasConfidence = Boolean(levelKey) || Number.isFinite(score);
  const lowConfidence = levelKey === "low" || Number.isFinite(score) && score < 0.6;
  if (!hasConfidence) return { overall: "\u672A\u63D0\u4F9B", lowConfidence: false, levelLabel: null };
  return {
    overall: lowConfidence ? "\u5EFA\u8BAE\u8C28\u614E\u89E3\u91CA" : "\u53EF\u89E3\u91CA",
    lowConfidence,
    levelLabel
  };
}
var CONFIDENCE_COMPONENT_LABELS = {
  video_quality: "\u753B\u9762\u8D28\u91CF",
  signal_stability: "\u4FE1\u53F7\u7A33\u5B9A\u6027",
  effective_duration: "\u6709\u6548\u65F6\u957F",
  modality_consistency: "\u8BC1\u636E\u4E00\u81F4\u6027",
  modality_completeness: "\u8BC1\u636E\u5B8C\u6574\u5EA6",
  history_stability: "\u7ED3\u679C\u7A33\u5B9A\u6027"
};
function confidenceConcerns(report) {
  const verdict = dataQualityVerdict(report);
  if (!verdict.lowConfidence) return [];
  const components = getAt(summaryOf(report), "confidence.components", {}) || {};
  return Object.entries(components).filter(([, value]) => Number.isFinite(Number(value))).sort((a, b) => Number(a[1]) - Number(b[1])).slice(0, 2).map(([key]) => CONFIDENCE_COMPONENT_LABELS[key]).filter(Boolean);
}
function qualityCards(report) {
  const source2 = report.result?.summary_json;
  const overall = dataQualityVerdict(report).overall;
  const items = [
    { name: "\u4EBA\u8138\u6709\u6548\u7387", value: getAt(source2, "quality.face_valid_ratio", null), percent: true },
    { name: "\u4EBA\u8138\u8D28\u91CF", value: getAt(source2, "quality.face_quality", null), percent: false },
    { name: "\u8FD0\u52A8\u5E72\u6270", value: getAt(source2, "quality.motion_noise_index", null), percent: false },
    { name: "\u4E22\u5E27\u7387", value: getAt(source2, "quality.drop_rate_percent", null), percent: true }
  ];
  return items.map((item) => ({
    ...item,
    verdict: item.value == null ? "\u672A\u63D0\u4F9B" : overall === "\u5EFA\u8BAE\u8C28\u614E\u89E3\u91CA" ? "\u5EFA\u8BAE\u8C28\u614E\u89E3\u91CA" : "\u53EF\u89E3\u91CA"
  }));
}
function overviewNarrative(report) {
  const core = coreMetricViews(report), screening = screeningMetricViews(report);
  const byKey = (key) => [...core, ...screening].find((item) => item.key === key);
  const stress = byKey("stress_load"), fatigue = byKey("fatigue_recovery");
  const arousal = byKey("physiological_arousal"), attention = byKey("attention_focus");
  const depression = byKey("depression"), anxiety = byKey("anxiety");
  const result = (item) => item ? `${item.name}${item.score == null ? "" : displayNumber(item.score)}\uFF08${item.level}\uFF09` : "\u672A\u63D0\u4F9B";
  return [
    `\u672C\u6B21\u6D4B\u8BC4\u7684\u6838\u5FC3\u5FC3\u7406\u751F\u7406\u7ED3\u679C\u4E3A\uFF1A${result(stress)}\uFF0C${result(fatigue)}\uFF0C${result(arousal)}\uFF0C${result(attention)}\u3002\u8FD9\u4E9B\u7ED3\u679C\u63CF\u8FF0\u7684\u662F\u6D4B\u8BC4\u65F6\u6BB5\u5185\u538B\u529B\u3001\u6062\u590D\u3001\u751F\u7406\u6FC0\u6D3B\u4E0E\u89C6\u89C9\u5173\u6CE8\u7684\u7EC4\u5408\u72B6\u6001\uFF0C\u4E0D\u662F\u5BF9\u957F\u671F\u4EBA\u683C\u6216\u80FD\u529B\u7684\u76F4\u63A5\u5224\u5B9A\u3002`,
    `\u72B6\u6001\u89E3\u8BFB\u65B9\u9762\uFF0C${attention ? `\u89C6\u89C9\u6CE8\u610F\u529B\u5904\u4E8E\u201C${attention.level}\u201D\u6863\u4F4D\uFF0C\u7528\u4E8E\u8F85\u52A9\u89C2\u5BDF\u4FE1\u606F\u83B7\u53D6\u4E0E\u6CE8\u89C6\u7A33\u5B9A\u6027` : "\u89C6\u89C9\u6CE8\u610F\u6570\u636E\u672A\u63D0\u4F9B"}\uFF1B${fatigue ? `\u75B2\u52B3\u6062\u590D\u8D1F\u8377\u5904\u4E8E\u201C${fatigue.level}\u201D\u6863\u4F4D\uFF0C\u5E94\u7ED3\u5408\u8FD1\u671F\u7761\u7720\u548C\u6062\u590D\u60C5\u51B5\u7406\u89E3` : "\u75B2\u52B3\u6062\u590D\u6570\u636E\u672A\u63D0\u4F9B"}\uFF1B${stress ? `\u538B\u529B\u8D1F\u8377\u5904\u4E8E\u201C${stress.level}\u201D\u6863\u4F4D` : "\u538B\u529B\u8D1F\u8377\u6570\u636E\u672A\u63D0\u4F9B"}\uFF1B${arousal ? `\u751F\u7406\u5524\u9192\u7EBF\u7D22\u5904\u4E8E\u201C${arousal.level}\u201D\u6863\u4F4D` : "\u751F\u7406\u5524\u9192\u6570\u636E\u672A\u63D0\u4F9B"}\u3002`,
    `\u5FC3\u7406\u65B9\u5411\u7B5B\u67E5\u65B9\u9762\uFF0C${result(depression)}\uFF0C${result(anxiety)}\u3002\u7B5B\u67E5\u7ED3\u679C\u7528\u4E8E\u63D0\u793A\u662F\u5426\u9700\u8981\u8FDB\u4E00\u6B65\u786E\u8BA4\uFF0C\u4E0D\u7B49\u540C\u4E8E\u4E34\u5E8A\u8BCA\u65AD\uFF1B\u5982\u540E\u7EED\u540C\u7C7B\u7ED3\u679C\u6301\u7EED\u504F\u79BB\uFF0C\u5EFA\u8BAE\u7ED3\u5408\u6807\u51C6\u91CF\u8868\u3001\u4E13\u4E1A\u8BBF\u8C08\u548C\u8FD1\u671F\u5B9E\u9645\u60C5\u5883\u590D\u6838\u3002\u672C\u6B21\u7ED3\u679C\u5B9C\u4F5C\u4E3A\u76F8\u8FD1\u6761\u4EF6\u4E0B\u540E\u7EED\u590D\u6D4B\u7684\u5BF9\u7167\u57FA\u7EBF\u3002`
  ];
}
function scoreText(metric2) {
  return metric2.score == null ? `${metric2.name}\u4E3A${metric2.level}` : `${metric2.name}${displayNumber(metric2.score)}\uFF08${metric2.level}\uFF09`;
}
function deterministicPageSummary(report, tab) {
  const core = coreMetricViews(report);
  const screening = screeningMetricViews(report);
  const coreText = core.map(scoreText).join("\uFF0C");
  const screeningText = screening.map(scoreText).join("\uFF0C");
  if (tab === "overview") return {
    text: `${screeningText}\uFF1B${coreText}\u3002`,
    constraint: "\u672C\u9875\u53EA\u6C47\u603B\u672C\u6B21\u5206\u6790\u7684\u7ED3\u679C\u5206\u7C7B\u548C\u6570\u503C\uFF1B\u7B5B\u67E5\u7ED3\u679C\u4E0D\u662F\u533B\u5B66\u8BCA\u65AD\uFF0C\u9700\u7ED3\u5408\u91CF\u8868\u3001\u8BBF\u8C08\u53CA\u5B9E\u9645\u60C5\u51B5\u7EFC\u5408\u5224\u65AD\u3002"
  };
  if (tab === "core") return {
    text: `\u672C\u6B21\u6838\u5FC3\u72B6\u6001\u7ED3\u679C\u4E3A\uFF1A${coreText}\u3002\u5404\u9879\u7ED3\u679C\u7684\u542B\u4E49\u3001\u53C2\u8003\u533A\u95F4\u548C\u89E3\u91CA\u8FB9\u754C\u89C1\u4E0B\u65B9\u5361\u7247\u3002`,
    constraint: "\u8FD9\u4E9B\u6570\u503C\u53CD\u6620\u672C\u6B21\u77ED\u65F6\u6D4B\u8BC4\u72B6\u6001\uFF0C\u53D7\u6D4B\u8BD5\u60C5\u5883\u548C\u91C7\u96C6\u8D28\u91CF\u5F71\u54CD\uFF0C\u4E0D\u80FD\u5355\u72EC\u5224\u65AD\u7A33\u5B9A\u4EBA\u683C\u6216\u5C97\u4F4D\u80DC\u4EFB\u3002"
  };
  if (tab === "screening") return {
    text: `\u672C\u6B21\u65B9\u5411\u7B5B\u67E5\u7ED3\u679C\u4E3A\uFF1A${screeningText}\u3002\u82E5\u5206\u7C7B\u63D0\u793A\u9700\u8981\u5173\u6CE8\uFF0C\u5E94\u518D\u7ED3\u5408\u6807\u51C6\u91CF\u8868\u3001\u8BBF\u8C08\u548C\u8FD1\u671F\u5B9E\u9645\u60C5\u5883\u786E\u8BA4\u3002`,
    constraint: "\u6291\u90C1\u3001\u7126\u8651\u5747\u4E3A\u65B9\u5411\u7B5B\u67E5\u800C\u975E\u4E34\u5E8A\u8BCA\u65AD\uFF1B\u62A5\u544A\u4E0D\u4F7F\u7528\u4E00\u6B21\u89C6\u9891\u7ED3\u679C\u5224\u5B9A\u662F\u5426\u60A3\u75C5\u3002"
  };
  if (tab === "evidence") return {
    text: `\u672C\u9875\u7528\u4E8E\u786E\u8BA4\u89C6\u9891\u91C7\u96C6\u8D28\u91CF\uFF0C\u5E76\u4FDD\u7559\u9762\u90E8\u52A8\u4F5C\uFF08AU\uFF09\u3001\u5FAE\u632F\u52A8\uFF08Vibra\uFF09\u3001${rppgAvailable(report) ? "\u53EF\u7528\u7684\u751F\u7406\u8282\u5F8B\u4F30\u8BA1\uFF08rPPG\uFF09" : "\u672A\u8FBE\u5230\u89E3\u91CA\u6761\u4EF6\u7684\u751F\u7406\u8282\u5F8B\u4F30\u8BA1"}\u4E0E${eyeAvailable(report) ? "\u773C\u52A8\u6CE8\u610F" : "\u672A\u91C7\u96C6\u7684\u773C\u52A8\u72B6\u6001"}\u7B49\u8BC4\u4F30\u4F9D\u636E\u3002\u5E95\u5C42\u8BC1\u636E\u53EA\u7528\u4E8E\u7ED3\u679C\u8FFD\u6EAF\uFF0C\u4E0D\u5355\u72EC\u5F62\u6210\u5FC3\u7406\u98CE\u9669\u7ED3\u8BBA\u3002`,
    constraint: "\u9762\u90E8\u52A8\u4F5C\u3001\u5FAE\u632F\u52A8\u3001\u751F\u7406\u8282\u5F8B\u4F30\u8BA1\u4E0E\u773C\u52A8\u7EBF\u7D22\u5747\u4E3A\u8F85\u52A9\u8BC1\u636E\uFF1B\u5355\u9879\u504F\u9AD8\u6216\u504F\u4F4E\u4E0D\u7B49\u540C\u4E8E\u5FC3\u7406\u98CE\u9669\uFF0C\u4E5F\u4E0D\u80FD\u53D6\u4EE3\u6838\u5FC3\u7ED3\u679C\u5206\u7C7B\u3002"
  };
  return {
    text: "\u672C\u9875\u6682\u65E0\u53EF\u5C55\u793A\u5185\u5BB9\u3002",
    constraint: "\u672C\u62A5\u544A\u4E0D\u81EA\u52A8\u5224\u65AD\u5C97\u4F4D\u80DC\u4EFB\u6216\u75BE\u75C5\u3002"
  };
}
function pageSummary(report, tab) {
  return deterministicPageSummary(report, tab);
}
function managementActions(report) {
  const hasAttention = resultOverview(report).attention.length > 0;
  const actions = [
    hasAttention ? report.scene === "community" ? "\u53EF\u4EE5\u8054\u7CFB\u5FC3\u7406\u5065\u5EB7\u4E13\u4E1A\u4EBA\u5458\uFF0C\u7ED3\u5408\u6807\u51C6\u91CF\u8868\u3001\u8BBF\u8C08\u548C\u8FD1\u671F\u751F\u6D3B\u72B6\u51B5\u8FDB\u4E00\u6B65\u4E86\u89E3\u672C\u6B21\u7ED3\u679C\u3002" : "\u4F18\u5148\u5B89\u6392\u4EBA\u5DE5\u590D\u6838\uFF0C\u7ED3\u5408\u91CF\u8868\u3001\u8BBF\u8C08\u4E0E\u8FD1\u671F\u60C5\u5883\u786E\u8BA4\u98CE\u9669\u3002" : "\u5F53\u524D\u672A\u89C1\u9700\u7ACB\u5373\u5347\u7EA7\u7684\u7B5B\u67E5\u7ED3\u8BBA\uFF0C\u5EFA\u8BAE\u7ED3\u5408\u65E5\u5E38\u72B6\u6001\u6301\u7EED\u89C2\u5BDF\u3002"
  ];
  actions.push(
    dataQualityVerdict(report).lowConfidence ? "\u672C\u6B21\u8BC1\u636E\u7F6E\u4FE1\u5EA6\u8F83\u4F4E\uFF0C\u5EFA\u8BAE\u6539\u5584\u5149\u7167\u3001\u59FF\u6001\u4E0E\u5F55\u5236\u7A33\u5B9A\u6027\u540E\u590D\u6D4B\u3002" : "\u4FDD\u7559\u672C\u6B21\u8BB0\u5F55\u4F5C\u4E3A\u57FA\u7EBF\uFF0C\u5728\u76F8\u8FD1\u6761\u4EF6\u4E0B\u8FDB\u884C\u540E\u7EED\u590D\u6D4B\u5BF9\u7167\u3002"
  );
  if (!eyeAvailable(report)) actions.push("\u773C\u52A8\u672A\u91C7\u96C6\uFF0C\u672C\u62A5\u544A\u4E0D\u5BF9\u89C6\u89C9\u6CE8\u610F\u529B\u4F5C\u63A8\u65AD\u3002");
  return actions;
}

// ../../scripts/export-report-pdf.ts
var source = JSON.parse(readFileSync(0, "utf8"));
function detail(item) {
  const thresholds = hasPartnerThresholds(item);
  const [, lower, upper] = item.thresholds;
  const start = isScreeningRange(item) ? 0 : lower;
  const end = isScreeningRange(item) ? 50 : item.direction === "higher_better" ? 100 : upper;
  return {
    ...item,
    aviationMeaning: source.scene === "community" ? item.plainMeaning : item.aviationMeaning,
    scoreText: item.score == null ? "\u672A\u63D0\u4F9B" : displayNumber(item.score),
    reference: thresholds ? standardRangeText(item) : "\u672A\u63D0\u4F9B\u6B63\u5F0F\u53C2\u8003\u533A\u95F4",
    thresholdsAvailable: thresholds,
    rangeStart: start,
    rangeWidth: Math.max(0, end - start),
    marker: Math.max(0, Math.min(100, item.score || 0))
  };
}
var overview = resultOverview(source);
var output = {
  tabs: REPORT_TABS,
  overview,
  narratives: overviewNarrative(source),
  headline: source.result_valid === false ? "\u672C\u6B21\u7ED3\u679C\u6682\u4E0D\u5EFA\u8BAE\u6B63\u5F0F\u89E3\u91CA" : overview.attention.length ? `\u672C\u6B21\u5EFA\u8BAE\u91CD\u70B9\u67E5\u770B\uFF1A${overview.attention.map((i) => `${i.name}\uFF08${i.level}\uFF09`).join("\u3001")}` : "\u672C\u6B21\u6838\u5FC3\u7ED3\u679C\u6574\u4F53\u6B63\u5E38\uFF0C\u672A\u89C1\u9700\u7ACB\u5373\u5173\u6CE8\u9879",
  summaries: { screening: pageSummary(source, "screening"), core: pageSummary(source, "core"), evidence: pageSummary(source, "evidence") },
  core: coreMetricViews(source).map(detail),
  screening: screeningMetricViews(source).map(detail),
  metrics: overview.metrics.map(detail),
  quality: qualityCards(source).map((q) => ({ ...q, display: q.value == null ? "\u672A\u63D0\u4F9B" : q.percent ? displayPercent(q.value) : displayNumber(q.value) })),
  qualityVerdict: dataQualityVerdict(source),
  concerns: confidenceConcerns(source),
  actions: managementActions(source),
  evidence: [
    { name: "\u9762\u90E8\u52A8\u4F5C\u7EBF\u7D22\uFF08AU\uFF09", definition: "\u4E3A\u538B\u529B\u3001\u75B2\u52B3\u7B49\u6838\u5FC3\u7ED3\u679C\u63D0\u4F9B\u9762\u90E8\u6D3B\u52A8\u4F9D\u636E\uFF0C\u4E0D\u76F4\u63A5\u7B49\u540C\u4E8E\u5177\u4F53\u60C5\u7EEA\u6216\u75BE\u75C5\u3002", items: pageMetrics(source, "au"), available: true },
    { name: "\u9762\u90E8\u5FAE\u632F\u52A8\u7EBF\u7D22\uFF08Vibra\uFF09", definition: "\u8BB0\u5F55\u7EC6\u5FAE\u8FD0\u52A8\u5F62\u6210\u7684\u72B6\u6001\u4F9D\u636E\uFF0C\u4E0D\u7528\u4E8E\u8F93\u51FA\u4EBA\u683C\u3001\u653B\u51FB\u6027\u6216\u5C97\u4F4D\u7ED3\u8BBA\u3002", items: pageMetrics(source, "vibra"), available: true },
    { name: "\u9762\u90E8\u751F\u7406\u8282\u5F8B\u4F30\u8BA1\uFF08rPPG\uFF09", definition: "\u901A\u8FC7\u9762\u90E8\u89C6\u9891\u4F30\u7B97\u5FC3\u7387\u7B49\u7EBF\u7D22\uFF0C\u53D7\u5149\u7167\u3001\u5934\u52A8\u548C\u4FE1\u53F7\u8D28\u91CF\u5F71\u54CD\u3002", items: pageMetrics(source, "rppg"), available: rppgAvailable(source), reasons: rppgReasons(source) },
    { name: "\u89C6\u89C9\u5173\u6CE8\u7EBF\u7D22", definition: "\u666E\u901A\u6444\u50CF\u5934\u5F62\u6210\u7684\u5173\u6CE8\u8FD1\u4F3C\u4F30\u8BA1\uFF0C\u4E0D\u7B49\u540C\u4E8E\u4E13\u4E1A\u773C\u52A8\u4EEA\u3002", items: pageMetrics(source, "eye"), available: eyeAvailable(source) }
  ]
};
process.stdout.write(JSON.stringify(output));
