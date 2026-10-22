"""Compile the selected MNIST decision tree into an RTG sharecode blueprint.

Winner config (exp4): k=9, t=0.2, md=8, min_leaf=2 -> val 0.7578, test 0.7626.

Fabric rules (verified in-game or against 204 real saves; one joint per circle):
  switch --(f==1)--> gate input         [sw.self1 -> gate.sock2/3]
  switch --(f==1)--> light               [light.self1 -> sw.sock2]
  switch --(f>=2)--> splitter tree       root [S1.self3 -> sw.sock2]
  gate out --(f==1, light)--> light      [light.self1 -> gate.sock1]
  gate out --(1-on-1 relay)--> Wire      [wire.self1 -> src.sock1]
                                          [wire.self3 -> cons.sock{2,3}]
  (one joint per PIECE: Splitter_2 = P34/P56/P910 pieces; never both faces
  of one piece to different locations -- v5 tore splitters that way)
  splitter chain (verified real data)    [S_{i+1}.self3 -> S_i.sock6]
  splitter out --> gate in               [S.self5/9 -> gate.sock2/3]
  splitter out --> light                 [light.self1 -> S.sock6/10]
  NOT input                              [sw.self1 -> NOT.sock2]
  digit merge: L leaves -> L-1 Gate-OR chain -> light

Structure (one rigid creation, user-discovered mechanic):
  a single Base root carries props.EphemeralAttachments = {uuid: {partName,
  cframe}} where cframe = Roblox GetComponents order (x,y,z + row-major R9);
  children reference the uuid as their parent_socket.
  gates  [self4 -> {uuid}]     switches [self3 -> {uuid}]  (FIRST joint = pose;
  later signal joints act as links, v1 confirmed first-joint pose authority).

The emitted blueprint is verified offline by simulating its signal network
and comparing the 10 light states against tree_predict on real inputs.
"""
import json
import sys
import time
import uuid as uuid_mod
from collections import defaultdict, deque
from pathlib import Path

import numpy as np

import exp3 as X
import exp4 as F
import train_exp as E
from blueprint import Blueprint

HERE = Path(__file__).resolve().parent
MODEL_OUT = HERE / "model.json"
CODE_OUT = HERE / "digit_net.sharecode"

K, T, MD, ML = 9, 0.2, 8, 2

# flat layout: switches/panel and gates at z=0; anchored relays on a z=+4 layer
# over the same gate-grid footprint (user-directed: no free-floating relays)
PANEL_S = 2.0                                   # switch grid spacing
DISPLAY_X0, DISPLAY_Y, DISPLAY_S = -1.0, 4.0, 2.0   # 10 digit lights' gates
GATE_X0, GATE_Y0, GATE_COLS, GATE_S = -20.0, -24.0, 40, 2.0
ROT9 = [1, 0, 0, 0, 1, 0, 0, 0, 1]

_UUID_NS = uuid_mod.UUID("1b671a64-40d5-491e-99b0-da01ff1f3341")


def guuid(tag):
    return "{" + str(uuid_mod.uuid5(_UUID_NS, tag)) + "}"

OUT_SELF = {"Switch": {"1"}, "Splitter_2": {"5", "9"}, "Wire": {"3"}}
IN_PARENT = {"Gate-AND": {"2", "3"}, "Gate-OR": {"2", "3"}, "Gate-NOT": {"2"},
             "Splitter_2": {"4"}}
OUT_PARENT = {"Gate-AND": {"1"}, "Gate-OR": {"1"}, "Gate-NOT": {"1"},
              "Switch": {"2"}, "Splitter_2": {"6", "10"}}
IN_SELF = {"Gate-AND": {"2", "3"}, "Gate-OR": {"2", "3"}, "Gate-NOT": {"2"},
           "Splitter_2": {"3"}, "Light": {"1"}, "Wire": {"1"}}


def signal_edge(child_name, cs, parent_name, ps):
    """Return (src_idx_side, dst) classification: 'c2p', 'p2c', or None."""
    a = cs in OUT_SELF.get(child_name, ()) and ps in IN_PARENT.get(parent_name, ())
    b = ps in OUT_PARENT.get(parent_name, ()) and cs in IN_SELF.get(child_name, ())
    if a and b:
        raise ValueError(f"ambiguous edge {child_name}.{cs} -> {parent_name}.{ps}")
    if a:
        return "c2p"
    if b:
        return "p2c"
    return None


class Net:
    def __init__(self):
        self.bp = None
        self.base = None
        self.sw = {}                    # pixel -> switch idx (live pixels only)
        self.lights = []
        self.not_of = {}
        self.cons = defaultdict(list)   # source key -> [(kind, idx, sock)]
        self.leaf_sigs = []             # (digit, source key)
        self.stats = defaultdict(int)
        self.attaches = {}              # uuid -> cframe (12 floats)

    # ---- part creation ----
    def add(self, name, props=None):
        return self.bp.add(name, props)

    def attach(self, part, sock, tag, x, y, z):
        """Pose `part` on the Base via an ephemeral attachment (first joint)."""
        key = guuid(tag)
        assert key not in self.attaches, key
        self.bp.connect(part, sock, self.base, key)
        self.attaches[key] = [round(float(x), 4), round(float(y), 4),
                              round(float(z), 4)] + ROT9

    def need_not(self, p):
        if p not in self.not_of:
            ni = self.add("Gate-NOT")
            self.not_of[p] = ni
            self.add_cons(("sw", p), ("gate", ni, "2"))
        return self.not_of[p]

    def add_cons(self, src, cons):
        self.cons[src].append(cons)

    def gate_of(self, src):
        return src[1] if src[0] == "g" else self.not_of[src[1]]

    # ---- layout ----
    def pose_gates(self):
        """Digit-display gates in a row above the panel, the rest in a grid."""
        light_src = {}
        for src, cl in self.cons.items():
            for c in cl:
                if c[0] == "light":
                    light_src[c[1]] = src
        display = {}
        for d, light in enumerate(self.lights):
            src = light_src.get(light)
            if src and src[0] != "sw":     # switch-fed light sits at the panel
                display[d] = self.gate_of(src)
        display_set = set(display.values())
        all_gates = [i for i, (nm, _, _) in enumerate(self.bp.objects)
                     if nm.startswith("Gate")]
        grid = [g for g in all_gates if g not in display_set]
        for d, g in display.items():
            self.attach(g, "4", f"display/{d}",
                        DISPLAY_X0 + DISPLAY_S * d, DISPLAY_Y, 0.0)
        for j, g in enumerate(grid):
            self.attach(g, "4", f"gate/{g}",
                        GATE_X0 + GATE_S * (j % GATE_COLS),
                        GATE_Y0 - GATE_S * (j // GATE_COLS), 0.0)
        return len(display)

    def finalize_base(self):
        self.bp.objects[self.base][2] = {
            "EphemeralAttachments": {
                k: {"partName": "Base", "cframe": v}
                for k, v in self.attaches.items()}}

    # ---- tree walk ----
    def walk(self, nodes, nid, sig):
        nd = nodes[nid]
        if nd["f"] == -1:
            self.leaf_sigs.append((nd["digit"], sig))
            return
        if nd["depth"] == 0:
            p = nd["f"]
            self.need_not(p)
            self.walk(nodes, nd["l"], ("sw", p))
            self.walk(nodes, nd["r"], ("not", p))
            return
        a = self.add("Gate-AND")
        b = self.add("Gate-AND")
        self.add_cons(sig, ("gate", a, "2"))
        self.add_cons(sig, ("gate", b, "2"))
        self.add_cons(("sw", nd["f"]), ("gate", a, "3"))
        self.need_not(nd["f"])
        self.add_cons(("not", nd["f"]), ("gate", b, "3"))
        self.walk(nodes, nd["l"], ("g", a))
        self.walk(nodes, nd["r"], ("g", b))

    # ---- digit merges ----
    def emit_digits(self):
        byd = defaultdict(list)
        for digit, sig in self.leaf_sigs:
            byd[digit].append(sig)
        for d in range(10):
            sigs = byd[d]
            assert sigs, f"digit {d} has no leaf"
            light = self.lights[d]
            if len(sigs) == 1:
                self.add_cons(sigs[0], ("light", light))
                continue
            prev = sigs[0]
            for i in range(1, len(sigs)):
                o = self.add("Gate-OR")
                self.add_cons(prev, ("gate", o, "2"))
                self.add_cons(sigs[i], ("gate", o, "3"))
                prev = ("g", o)
            self.add_cons(prev, ("light", light))

    # ---- fanout emission ----
    # One joint per PIECE (hard game rule learned from v5): a Splitter_2 is
    # three pieces -- P34 (child3/parent4), P56 (child5/parent6),
    # P910 (child9/parent10) -- and joints on both faces of one piece to
    # different locations tear it off (v5's frozen-output grid + blob).
    # This scheme never does that: each consumer occupies one circle index,
    # using either its child or its parent face, never both on one relay.
    def cons_joint(self, splitter, circle, c):
        if c[0] == "gate":
            self.bp.connect(splitter, circle, c[1], c[2])
        else:  # light: parent-side socket of the splitter circle
            self.bp.connect(c[1], 1, splitter, 6 if circle == 5 else 10)

    def emit_fanout(self, src, cons):
        if not cons:
            return
        bp = self.bp
        if len(cons) == 1:
            c = cons[0]
            if src[0] == "sw":
                sw = self.sw[src[1]]
                if c[0] == "gate":
                    bp.connect(sw, 1, c[1], c[2])
                else:
                    bp.connect(c[1], 1, sw, 2)
                return
            if c[0] == "light":
                bp.connect(c[1], 1, self.gate_of(src), 1)
                return
            # 1-on-1 relay: Wire (single-mated pieces: child1 in, child3 out)
            # (verified real pairs: wire.self1 -> gate.sock1,
            #  wire.self3 -> gate.sock2/3)
            w = self.add("Wire")
            bp.connect(w, 1, self.gate_of(src), 1)
            bp.connect(w, 3, c[1], c[2])
            self.stats["wire_taps"] += 1
            return
        n = len(cons)
        n_split = max(1, n - 1)
        splits = [self.add("Splitter_2") for _ in range(n_split)]
        s1 = splits[0]
        if src[0] == "sw":
            bp.connect(s1, 3, self.sw[src[1]], 2)
        else:
            bp.connect(s1, 3, self.gate_of(src), 1)
        ci = 0
        for i in range(n_split - 1):          # intermediates: chain on circle5
            self.cons_joint(splits[i], 9, cons[ci])
            ci += 1
            bp.connect(splits[i + 1], 3, splits[i], 6)
        last = splits[-1]
        for circle in (5, 9):                 # last splitter takes the rest
            if ci >= n:
                break
            self.cons_joint(last, circle, cons[ci])
            ci += 1
        assert ci == n, f"consumer placement mismatch {ci}/{n}"


    def emit_fanouts(self):
        for key in sorted(self.cons, key=str):
            self.emit_fanout(key, self.cons[key])


def build_and_emit():
    t0 = time.time()
    xtr_img, ytr, xva_img, yva, xte_img, yte = E.split_data()
    xtr = E.binarize(xtr_img, K, T)
    xva = E.binarize(xva_img, K, T)
    xte = E.binarize(xte_img, K, T)
    tree = E.build_tree(xtr, ytr, 0, MD, min_leaf=ML)
    va = float((E.tree_predict(tree, xva) == yva).mean())
    te = float((E.tree_predict(tree, xte) == yte).mean())
    print(f"model: val={va:.4f} test={te:.4f}", flush=True)
    assert abs(te - 0.7626) < 1e-9, f"test acc drift: {te} != 0.7626"

    nodes = F.to_nodes(tree)
    cost = X.tree_cost(nodes, K * K)

    net = Net()
    net.bp = Blueprint()
    net.base = net.add("Base")          # entry 0 = the one structural root
    net.lights = [net.add("Light", {"Activated": False}) for _ in range(10)]
    root = nodes[0]
    assert root["f"] != -1, "degenerate tree"
    net.walk(nodes, 0, ("sw", root["f"]))
    net.emit_digits()
    # switches: structure joint FIRST (pose authority), signal joints later
    for p in sorted({k[1] for k in net.cons if k[0] == "sw"}):
        sw = net.add("Switch")
        net.sw[p] = sw
        r, c = divmod(p, K)
        net.attach(sw, "3", f"switch/{p}", PANEL_S * c, -PANEL_S * r, 0.0)
    net.emit_fanouts()
    n_display = net.pose_gates()
    # anchors: freeze the whole creation (probe-verified; must spawn Activated).
    # One anchor held a 5-part probe; use four at the footprint corners so a
    # 2400-part wall can't tip as one rigid piece (v4 failure mode).
    gate_n = sum(1 for nm, _, _ in net.bp.objects if nm.startswith("Gate"))
    rows = (gate_n + GATE_COLS - 1) // GATE_COLS
    y_top, y_bot = DISPLAY_Y, GATE_Y0 - GATE_S * (rows - 1)
    x0, x1 = GATE_X0, GATE_X0 + GATE_S * (GATE_COLS - 1)
    for i, (ax, ay) in enumerate([(x0, y_top), (x1, y_top),
                                  (x0, y_bot), (x1, y_bot)]):
        a = net.add("Anchor", {"Activated": True})
        net.attach(a, "1", f"anchor/{i}", ax, ay, 0.0)
    net.finalize_base()

    spawn = int(E.tree_predict(tree, np.zeros((1, K * K), dtype=np.float32))[0])
    net.bp.objects[net.lights[spawn]][2]["Activated"] = True
    return net, tree, nodes, cost, va, te, spawn, xte, yte, time.time() - t0


def check_invariants(bp, cost, n_att):
    n = len(bp.objects)
    parent_seen, child_seen = set(), set()
    for i, (name, conns, props) in enumerate(bp.objects):
        for cs, ps, pi in conns:
            pk = (pi - 1, str(ps))
            ck = (i, str(cs))
            if pk in parent_seen:
                raise AssertionError(f"double joint on parent circle {pk}")
            if ck in child_seen:
                raise AssertionError(f"double joint on child circle {ck}")
            parent_seen.add(pk)
            child_seen.add(ck)
            signal_edge(name, str(cs), bp.objects[pi - 1][0], str(ps))
    counts = defaultdict(int)
    for name, conns, props in bp.objects:
        counts[name] += 1
    parts = sum(counts.values())
    print(f"parts: total={parts} model_cost={cost['parts']} "
          f"attachments={n_att}", flush=True)
    print("  " + ", ".join(f"{n_}={c}" for n_, c in sorted(counts.items())),
          flush=True)
    return parts


# ---- offline logic simulation ----

def build_eval(bp):
    n = len(bp.objects)
    deps = [set() for _ in range(n)]
    inputs = defaultdict(dict)          # dest_idx -> {dest_sock: src_idx}
    edges = 0
    for i, (name, conns, props) in enumerate(bp.objects):
        for cs, ps, pi in conns:
            pj = pi - 1
            kind = signal_edge(name, str(cs), bp.objects[pj][0], str(ps))
            if kind is None:
                continue
            edges += 1
            if kind == "c2p":
                src, dst, dsock = i, pj, str(ps)
            else:
                src, dst, dsock = pj, i, str(cs)
            deps[dst].add(src)
            inputs[dst][dsock] = src
    indeg = [len(d) for d in deps]
    q = deque(i for i in range(n) if indeg[i] == 0)
    order = []
    while q:
        i = q.popleft()
        order.append(i)
        for j in range(n):
            if i in deps[j]:
                indeg[j] -= 1
                if indeg[j] == 0:
                    q.append(j)
    if len(order) != n:
        raise AssertionError(f"signal graph not a DAG: {len(order)}/{n}")
    return order, dict(inputs), edges


def eval_lights(bp, order, inputs, states):
    out = [False] * len(bp.objects)
    names = [o[0] for o in bp.objects]
    for i in order:
        nm = names[i]
        if nm == "Switch":
            out[i] = states.get(i, False)
        elif nm in ("Gate-AND", "Gate-OR", "Gate-NOT"):
            vals = [out[s] for s in inputs.get(i, {}).values()]
            if nm == "Gate-AND":
                out[i] = all(vals)
            elif nm == "Gate-OR":
                out[i] = any(vals)
            else:
                out[i] = not vals[0]
        elif nm in ("Splitter_2", "Wire"):
            src = next(iter(inputs.get(i, {}).values()))
            out[i] = out[src]
    return [out[inputs[li]["1"]] for li in LIGHT_IDX]


LIGHT_IDX = None


def verify_logic(net, tree, spawn, xte, yte, n_samples=500):
    global LIGHT_IDX
    bp = net.bp
    LIGHT_IDX = net.lights
    order, inputs, edges = build_eval(bp)
    print(f"signal graph: {edges} edges, topo order {len(order)}", flush=True)

    rng = np.random.default_rng(1)
    ids = rng.choice(len(xte), size=min(n_samples, len(xte)), replace=False)
    preds = np.full(len(ids), -1, dtype=np.int64)
    onehot_bad = 0
    for j, i in enumerate(ids):
        states = {net.sw[p]: bool(xte[i, p]) for p in net.sw}
        lights = eval_lights(bp, order, inputs, states)
        hits = [d for d, v in enumerate(lights) if v]
        if len(hits) != 1:
            onehot_bad += 1
        else:
            preds[j] = hits[0]
    tree_pred = E.tree_predict(tree, xte[ids])
    match = int((preds == tree_pred).sum())
    print(f"simulation: {match}/{len(ids)} match tree_predict, "
          f"non-onehot={onehot_bad}", flush=True)
    assert onehot_bad == 0 and match == len(ids), "simulation mismatch"

    zeros = {sw: False for sw in net.sw}
    lights = eval_lights(bp, order, inputs, zeros)
    hits = [d for d, v in enumerate(lights) if v]
    assert hits == [spawn], f"spawn prediction mismatch {hits} vs {spawn}"
    assert bp.objects[net.lights[spawn]][2]["Activated"] is True
    print(f"spawn state: light {spawn} ON (matches tree on all-zero input)",
          flush=True)
    return order, inputs


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    net, tree, nodes, cost, va, te, spawn, xte, yte, t_build = build_and_emit()
    bp = net.bp
    issues = bp.validate(strict=True)
    print(f"validate: strict OK ({len(bp.objects)} objects, roots={len(bp.roots())})",
          flush=True)
    parts = check_invariants(bp, cost, len(net.attaches))
    verify_logic(net, tree, spawn, xte, yte)

    model = {
        "config": {"k": K, "thresh": T, "max_depth": MD, "min_leaf": ML},
        "val": va, "test": te, "spawn_digit": spawn,
        "tree_cost_model": cost, "parts_total": parts,
        "roots": len(bp.roots()),
        "pixel_map": {"panel": "switch p at (2*col, -2*row, 0), p=raster idx",
                      "display": "digit d light fed by a gate at (-1+2d, 4, 0)",
                      "relays": "Wire 1-on-1 taps + Splitter_2 chains, unmounted (drape at mates)",
                      "anchors": "4x Anchor Activated=true at gate-grid corners",
                      "k": K},
        "tree": tree,
    }
    MODEL_OUT.write_text(json.dumps(model))
    code = bp.encode()
    CODE_OUT.write_text(code)
    print(f"model -> {MODEL_OUT.name}, sharecode -> {CODE_OUT.name} "
          f"({len(code)} chars)", flush=True)
    print(f"elapsed {t_build:.1f}s", flush=True)


if __name__ == "__main__":
    main()
