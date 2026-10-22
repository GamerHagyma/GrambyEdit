"""Splitter_3 probe: 1 input, 2 gate outputs, plus Base mount.

Circuit: SRC switch -> Gate-NOT -> Splitter_3 -> 2x Gate-OR -> 2x Light.
Each OR's second input is its own OFF switch, so both lights = NOT SRC.

Splitter_3 joints (mount FIRST): [self9 -> Base uuid], [self3 -> NOT.sock1],
[self5 -> OR_A.sock2], [self7 -> OR_B.sock2]. Every piece single-mated.

Pass = splitter stays pinned, both lights follow NOT SRC after toggling.
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
    sw = bp.add("Switch")
    not1 = bp.add("Gate-NOT")
    sp = bp.add("Splitter_3")
    ora = bp.add("Gate-OR")
    orb = bp.add("Gate-OR")
    offa = bp.add("Switch")
    offb = bp.add("Switch")
    la = bp.add("Light", {"Activated": False})
    lb = bp.add("Light", {"Activated": False})

    att = {}

    def mount(part, sock, name, x, y, z):
        key = guuid(f"s3probe/{name}")
        assert key not in att, key
        bp.connect(part, sock, base, key)
        att[key] = [round(float(x), 4), round(float(y), 4),
                    round(float(z), 4)] + ROT9

    mount(sw, "3", "sw", 0.0, 0.0, 0.0)
    mount(not1, "4", "not", 2.0, 0.0, 0.0)
    mount(sp, "9", "split", 4.0, 0.0, 0.0)
    mount(ora, "4", "ora", 6.0, 1.0, 0.0)
    mount(orb, "4", "orb", 6.0, -1.0, 0.0)
    mount(offa, "3", "offa", 6.0, 3.0, 0.0)
    mount(offb, "3", "offb", 6.0, -3.0, 0.0)

    bp.connect(sw, 1, not1, 2)
    bp.connect(sp, 3, not1, 1)
    bp.connect(sp, 5, ora, 2)
    bp.connect(sp, 7, orb, 2)
    bp.connect(offa, 1, ora, 3)
    bp.connect(offb, 1, orb, 3)
    bp.connect(la, 1, ora, 1)
    bp.connect(lb, 1, orb, 1)

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
    print("SPLITTER_3 PROBE sharecode:")
    print(code)
    print(f"\n{len(bp.objects)} objects, {len(code)} chars")
    print("expect: splitter pinned; after toggling SRC, both lights = NOT SRC")


if __name__ == "__main__":
    main()
