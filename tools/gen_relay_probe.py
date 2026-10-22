"""Minimal anchored-relay probe (v4 joint pattern, short spans).

Circuit: SRC switch -> Gate-NOT -> anchored Splitter_2 -> Gate-OR -> Light.
The OR's second input is an OFF switch (stays OFF), so OR = splitter signal.

Splitter joints replicate v4 exactly, mount FIRST:
  [S.self9 -> Base uuid] (mount), [S.self3 -> NOT.sock1] (in),
  [S.self5 -> OR.sock2] (out to gate).

Expected if the mount works: splitter stays pinned, spawn (switches OFF)
shows light ON, toggling SRC ON turns light OFF.
"""
import uuid as uuid_mod

from blueprint import Blueprint

_NS = uuid_mod.UUID("1b671a64-40d5-491e-99b0-da01ff1f3341")


def guuid(tag):
    return "{" + str(uuid_mod.uuid5(_NS, tag)) + "}"


ROT9 = [1, 0, 0, 0, 1, 0, 0, 0, 1]


def build(long_span=False):
    bp = Blueprint()
    base = bp.add("Base")
    sw = bp.add("Switch")
    not1 = bp.add("Gate-NOT")
    sp = bp.add("Splitter_2")
    org = bp.add("Gate-OR")
    swoff = bp.add("Switch")
    light = bp.add("Light", {"Activated": False})

    att = {}
    tag = "span" if long_span else "probe"

    def mount(part, sock, name, x, y, z):
        key = guuid(f"{tag}/{name}")
        assert key not in att, key
        bp.connect(part, sock, base, key)
        att[key] = [round(float(x), 4), round(float(y), 4),
                    round(float(z), 4)] + ROT9

    sx, ox = (15.0, 28.0) if long_span else (4.0, 6.0)
    mount(sw, "3", "sw_src", 0.0, 0.0, 0.0)
    mount(not1, "4", "not", 2.0, 0.0, 0.0)
    mount(sp, "9", "split", sx, 0.0, 0.0)
    mount(org, "4", "or", ox, 0.0, 0.0)
    mount(swoff, "3", "sw_off", ox, -2.0, 0.0)

    # signal joints AFTER mounts (mount = first joint = pose)
    bp.connect(sw, 1, not1, 2)      # SRC switch -> NOT input
    bp.connect(sp, 3, not1, 1)      # NOT output -> splitter in
    bp.connect(sp, 5, org, 2)       # splitter out -> OR input
    bp.connect(swoff, 1, org, 3)    # OFF switch -> OR second input
    bp.connect(light, 1, org, 1)    # OR output -> light

    bp.objects[base][2] = {
        "EphemeralAttachments": {
            k: {"partName": "Base", "cframe": v} for k, v in att.items()}}
    return bp


def main():
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    long_span = len(sys.argv) > 1 and sys.argv[1] == "long"
    bp = build(long_span)
    bp.validate(strict=True)
    code = bp.encode()
    print("RELAY PROBE sharecode:" if not long_span else "SPAN PROBE sharecode:")
    print(code)
    print(f"\n{len(bp.objects)} objects, {len(code)} chars")
    if long_span:
        print("stress test: splitter spans ~13u to each gate. "
              "expect: holds still + light follows SRC after toggle, "
              "OR anything drifts/flings.")
    else:
        print("expect: spawn light ON (switches OFF); SRC ON -> light OFF; "
              "splitter stays pinned")


if __name__ == "__main__":
    main()
