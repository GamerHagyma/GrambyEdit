"""Anchor probe: does an Anchor part freeze a creation in place?

Circuit: SRC switch -> Gate-NOT -> Light (light ON when SRC OFF, after a
toggle; spawn states don't propagate until first input change).

The Anchor is docked to the Base via uuid like everything else. Pass = the
assembly stays floating in spawn pose instead of flopping to the ground,
and logic still works after toggling SRC.
"""
import uuid as uuid_mod

from blueprint import Blueprint

_NS = uuid_mod.UUID("1b671a64-40d5-491e-99b0-da01ff1f3341")


def guuid(tag):
    return "{" + str(uuid_mod.uuid5(_NS, tag)) + "}"


ROT9 = [1, 0, 0, 0, 1, 0, 0, 0, 1]


def build():
    bp = Blueprint()
    base = bp.add("Base")
    anchor = bp.add("Anchor", {"Activated": True})
    sw = bp.add("Switch")
    not1 = bp.add("Gate-NOT")
    light = bp.add("Light", {"Activated": False})

    att = {}

    def mount(part, sock, name, x, y, z):
        key = guuid(f"anchorprobe/{name}")
        assert key not in att, key
        bp.connect(part, sock, base, key)
        att[key] = [round(float(x), 4), round(float(y), 4),
                    round(float(z), 4)] + ROT9

    mount(anchor, "1", "anchor", 0.0, -2.0, 0.0)
    mount(sw, "3", "sw", 0.0, 0.0, 0.0)
    mount(not1, "4", "not", 2.0, 0.0, 0.0)

    bp.connect(sw, 1, not1, 2)     # SRC switch -> NOT input
    bp.connect(light, 1, not1, 1)  # NOT output -> light

    bp.objects[base][2] = {
        "EphemeralAttachments": {
            k: {"partName": "Base", "cframe": v} for k, v in att.items()}}
    return bp


def main():
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    bp = build()
    bp.validate(strict=True)
    code = bp.encode()
    print("ANCHOR PROBE sharecode:")
    print(code)
    print(f"\n{len(bp.objects)} objects, {len(code)} chars")
    print("expect: assembly stays in spawn pose (no flop to ground); "
          "after toggling SRC, light = NOT SRC")


if __name__ == "__main__":
    main()
