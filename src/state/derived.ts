// Expensive validation and topology posing stay cached across animation frames.
import { computed } from '@preact/signals';
import { computePoses, EMPTY_POSES } from '../core/pose';
import { validate } from '../core/rules';
import { codeSize } from '../core/size';
import { buildStats } from '../core/stats';
import { settingsSig } from './settings';
import { catalogSig, docSig } from './store';
import { servoPreviewSig } from './servo-preview';
import { ServoPosePreview } from '../core/servo-poses';
import { wireStretchIssues } from '../core/wires';

export const committedPosesSig = computed(() => {
  const cat = catalogSig.value;
  return cat ? computePoses(docSig.value, cat, cat.conventions) : EMPTY_POSES;
});

let servoPoses: ServoPosePreview | null = null;
export const posesSig = computed(() => {
  const doc = docSig.value,
    cat = catalogSig.value,
    base = committedPosesSig.value;
  const preview = servoPreviewSig.value;
  if (!cat || !preview || preview.doc !== doc) {
    servoPoses = null;
    return base;
  }
  if (servoPoses?.doc !== doc || servoPoses.cat !== cat || servoPoses.id !== preview.id) {
    servoPoses = new ServoPosePreview(doc, cat, base, preview.id);
  }
  return servoPoses.at(preview.angle);
});

export const sizeSig = computed(() => codeSize(docSig.value));

export const statsSig = computed(() => buildStats(docSig.value));

const committedIssuesSig = computed(() => {
  const cat = catalogSig.value;
  return cat
    ? validate(
        docSig.value,
        cat,
        settingsSig.value.limits,
        sizeSig.value.base64Chars,
        committedPosesSig.value,
      )
    : [];
});

export const issuesSig = computed(() => {
  const issues = committedIssuesSig.value,
    preview = servoPreviewSig.value,
    cat = catalogSig.value;
  if (!preview || preview.doc !== docSig.value || !cat) return issues;
  return [
    ...issues.filter((i) => i.code !== 'W-WIRE-STRETCHED'),
    ...wireStretchIssues(docSig.value, cat, posesSig.value),
  ];
});
