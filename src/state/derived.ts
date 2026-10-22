// Values derived from the committed doc. `computed` recomputes lazily once per doc version;
// drags never commit per frame, so these never run per frame.
import { computed } from '@preact/signals';
import { computePoses, EMPTY_POSES } from '../core/pose';
import { validate } from '../core/rules';
import { codeSize } from '../core/size';
import { buildStats } from '../core/stats';
import { settingsSig } from './settings';
import { catalogSig, docSig } from './store';

export const posesSig = computed(() => {
  const cat = catalogSig.value;
  return cat ? computePoses(docSig.value, cat, cat.conventions) : EMPTY_POSES;
});

export const sizeSig = computed(() => codeSize(docSig.value));

export const statsSig = computed(() => buildStats(docSig.value));

export const issuesSig = computed(() => {
  const cat = catalogSig.value;
  return cat
    ? validate(docSig.value, cat, settingsSig.value.limits, sizeSig.value.base64Chars)
    : [];
});
