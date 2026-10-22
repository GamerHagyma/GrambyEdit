"""Road to Gramby's sharecode blueprint generator/decoder.

Format: base64( compact JSON array of [name, connections, props] ).
connection := [self_socket:str, parent_socket:str, parent_index_1based:int]
"""
import base64
import json

SELF_SOCKETS = {
    "Anchor": {1}, "Base": {3}, "Bearing": {1}, "BrakeLight": {1}, "Bumper": {1},
    "Button": {1, 3}, "Canister": {1}, "Connector": {5}, "ConnectorBall": {6},
    "Delayer": {2}, "FuelTank": {2}, "Gate-AND": {4}, "Gate-NOT": {4}, "Gate-OR": {4},
    "Grenade": {1}, "Gun": {2}, "Gyro": {1}, "HalfConnectorBall": {6},
    "InputSensor": {2}, "Light": {1}, "LongStick": {2}, "Looper": {1},
    "MountedGun": {1}, "Part": {1}, "RemoteButton": {1, 3}, "Rocket": {1},
    "Seat": {1}, "Servo": {1}, "ShortStick": {2}, "Sledge": {1},
    "Splitter_1": {3, 5}, "Splitter_2": {3, 5, 9}, "Splitter_3": {3, 5, 7, 9},
    "Splitter_4": {1, 3, 5, 7, 9}, "Stick": {2}, "Switch": {1, 3},
    "Thruster": {1}, "TripWire": {1, 3}, "VelocitySensor": {2}, "Wheel": {1},
    "Wing": {1}, "Wire": {1, 3},
}

PARENT_SOCKETS = {
    "Base": {1, 2, 4, 5, 6}, "Bumper": {2}, "Button": {2}, "Connector": {1, 2, 3, 4, 6},
    "Delayer": {1}, "FuelTank": {1}, "Gate-AND": {1, 2, 3}, "Gate-NOT": {1, 2},
    "Gate-OR": {1, 2, 3}, "InputSensor": {1}, "LongStick": {1}, "Looper": {2, 3, 4},
    "Part": {2, 3, 4, 5, 6},
    "RemoteButton": {2}, "Servo": {2, 3, 4}, "ShortStick": {1},
    "Splitter_1": {4, 6}, "Splitter_2": {4, 6, 10}, "Splitter_3": {4, 6, 8, 10},
    "Splitter_4": {2, 4, 6, 8, 10}, "Stick": {1}, "Switch": {2},
    "Wire": {2, 4},
}

GATE_SOCKETS = {"Gate-AND": {"out": 1, "in": (2, 3)},
                "Gate-OR": {"out": 1, "in": (2, 3)},
                "Gate-NOT": {"out": 1, "in": (2,)}}


def loads(code: str):
    raw = base64.b64decode(code + "=" * (-len(code) % 4))
    return json.loads(raw.decode("utf-8"))


def dumps(objects) -> str:
    return json.dumps(objects, separators=(",", ":"), ensure_ascii=False)


def encode(objects) -> str:
    return base64.b64encode(dumps(objects).encode("utf-8")).decode("ascii")


def decode(code: str):
    return loads(code)


class Blueprint:
    def __init__(self):
        self.objects = []

    @classmethod
    def from_objects(cls, objects):
        bp = cls()
        bp.objects = json.loads(json.dumps(objects))
        return bp

    @classmethod
    def from_sharecode(cls, code):
        return cls.from_objects(loads(code))

    def add(self, name, props=None):
        self.objects.append([name, [], dict(props) if props else []])
        return len(self.objects) - 1

    def connect(self, child, child_socket, parent, parent_socket):
        n = len(self.objects)
        if not (0 <= child < n and 0 <= parent < n):
            raise IndexError(f"object index out of range (child={child}, parent={parent}, n={n})")
        if child == parent:
            raise ValueError("self-attachment not allowed")
        self.objects[child][1].append([str(child_socket), str(parent_socket), parent + 1])
        return self

    def validate(self, strict=False):
        issues = []
        n = len(self.objects)
        for i, (name, conns, props) in enumerate(self.objects):
            if not isinstance(name, str):
                issues.append(f"[{i}] name is not a string: {name!r}")
            for conn in conns:
                if len(conn) != 3:
                    issues.append(f"[{i}] {name}: connection must have 3 fields: {conn!r}")
                    continue
                a, b, c = conn
                try:
                    ia, ic = int(a), int(c)
                except (TypeError, ValueError):
                    issues.append(f"[{i}] {name}: non-numeric connection {conn!r}")
                    continue
                if not (1 <= ic <= n):
                    issues.append(f"[{i}] {name}: parent index {ic} out of 1..{n}")
                    continue
                if ic - 1 == i:
                    issues.append(f"[{i}] {name}: references itself")
                if name in SELF_SOCKETS and ia not in SELF_SOCKETS[name]:
                    issues.append(f"[{i}] {name}: self socket {ia} not in observed set {sorted(SELF_SOCKETS[name])}")
                ptype = self.objects[ic - 1][0]
                try:
                    ib = int(b)
                except (TypeError, ValueError):
                    # ephemeral attachment: parent_socket is an attachment uuid
                    # declared in the parent's props.EphemeralAttachments
                    pprops = self.objects[ic - 1][2]
                    att = pprops.get("EphemeralAttachments") if isinstance(pprops, dict) else None
                    if not (att and b in att):
                        issues.append(f"[{i}] {name}: parent {ptype} has no ephemeral attachment {b!r}")
                    continue
                if ptype in PARENT_SOCKETS and ib not in PARENT_SOCKETS[ptype]:
                    issues.append(f"[{i}] {name}: parent {ptype} socket {ib} not in observed set {sorted(PARENT_SOCKETS[ptype])}")
            if not (isinstance(props, dict) or props == []):
                issues.append(f"[{i}] {name}: props must be an object or []")
        if strict and issues:
            raise ValueError("blueprint validation failed:\n" + "\n".join(issues))
        return issues

    def dumps(self):
        return dumps(self.objects)

    def encode(self):
        return encode(self.objects)

    def roots(self):
        return [i for i, o in enumerate(self.objects) if not o[1]]
