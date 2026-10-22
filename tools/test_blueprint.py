import json
import unittest

from blueprint import Blueprint, decode, dumps, encode, loads

AND_EXAMPLE = '[["Switch",[["1","3",2]],[]],["Gate-AND",[],[]],["Switch",[["1","2",2]],[]],["Light",[["1","1",2]],{"Activated":false}]]'
NOT_EXAMPLE = '[["Switch",[["1","2",2]],[]],["Gate-NOT",[],[]],["Light",[["1","1",2]],{"Activated":true}]]'
SPLITTER_EXAMPLE = '[["Light",[["1","1",4]],{"Activated":false}],["Splitter_2",[["3","2",3],["5","3",4],["9","2",4]],{"RGB":[33,248,203]}],["Switch",[],[]],["Gate-OR",[],[]]]'
CUBE_EXAMPLE = '[["Connector",[["5","1",15]],[]],["Connector",[["5","1",7]],[]],["ShortStick",[["2","1",17]],[]],["ShortStick",[["2","3",8]],[]],["ShortStick",[["2","2",11]],[]],["ShortStick",[["2","6",13]],[]],["ShortStick",[["2","1",1]],[]],["Connector",[["5","1",6]],[]],["Connector",[["5","1",14]],[]],["Connector",[],[]],["Connector",[["5","1",3]],[]],["ShortStick",[["2","1",13]],[]],["Connector",[["5","1",18]],[]],["ShortStick",[["2","6",10]],[]],["ShortStick",[["2","1",10]],[]],["ShortStick",[["2","3",2]],[]],["Connector",[["5","1",12]],[]],["ShortStick",[["2","4",10]],[]],["ShortStick",[["2","3",11]],[]],["ShortStick",[["2","6",1]],[]]]'
WIKI_RPG_CODE = "W1siUlBHLixbXSxbXV0sWyJSUEciLFtbMSwxLDFdXSxbXV1d"


class RoundTripTests(unittest.TestCase):
    def assert_roundtrip(self, text):
        self.assertEqual(dumps(json.loads(text)), text)

    def test_and_example(self):
        self.assert_roundtrip(AND_EXAMPLE)

    def test_not_example(self):
        self.assert_roundtrip(NOT_EXAMPLE)

    def test_splitter_example(self):
        self.assert_roundtrip(SPLITTER_EXAMPLE)

    def test_cube_example(self):
        self.assert_roundtrip(CUBE_EXAMPLE)

    def test_base64_roundtrip(self):
        code = encode(json.loads(AND_EXAMPLE))
        self.assertEqual(dumps(decode(code)), AND_EXAMPLE)
        self.assertEqual(loads(code), json.loads(AND_EXAMPLE))

    def test_wiki_rpg_code_is_corrupt(self):
        with self.assertRaises(json.JSONDecodeError):
            loads(WIKI_RPG_CODE)


class BuildTests(unittest.TestCase):
    def test_build_and_matches_example(self):
        bp = Blueprint()
        sw1 = bp.add("Switch")
        gate = bp.add("Gate-AND")
        sw2 = bp.add("Switch")
        light = bp.add("Light", {"Activated": False})
        bp.connect(sw1, 1, gate, 3)
        bp.connect(sw2, 1, gate, 2)
        bp.connect(light, 1, gate, 1)
        self.assertEqual(bp.dumps(), AND_EXAMPLE)

    def test_build_not_matches_example(self):
        bp = Blueprint()
        sw = bp.add("Switch")
        gate = bp.add("Gate-NOT")
        light = bp.add("Light", {"Activated": True})
        bp.connect(sw, 1, gate, 2)
        bp.connect(light, 1, gate, 1)
        self.assertEqual(bp.dumps(), NOT_EXAMPLE)

    def test_gate_last_variant_validates(self):
        bp = Blueprint()
        sw1 = bp.add("Switch")
        sw2 = bp.add("Switch")
        light = bp.add("Light", {"Activated": False})
        gate = bp.add("Gate-AND")
        bp.connect(sw1, 1, gate, 3)
        bp.connect(sw2, 1, gate, 2)
        bp.connect(light, 1, gate, 1)
        self.assertEqual(bp.validate(), [])
        self.assertEqual(bp.dumps(),
                         '[["Switch",[["1","3",4]],[]],["Switch",[["1","2",4]],[]],'
                         '["Light",[["1","1",4]],{"Activated":false}],["Gate-AND",[],[]]]')

    def test_mini_structure(self):
        bp = Blueprint()
        c0 = bp.add("Connector")
        stick = bp.add("ShortStick")
        c1 = bp.add("Connector")
        bp.connect(stick, 2, c0, 1)
        bp.connect(c1, 5, stick, 1)
        self.assertEqual(bp.validate(), [])
        self.assertEqual(bp.roots(), [0])
        self.assertEqual(bp.dumps(),
                         '[["Connector",[],[]],["ShortStick",[["2","1",1]],[]],'
                         '["Connector",[["5","1",2]],[]]]')


class ValidationTests(unittest.TestCase):
    def test_known_examples_clean(self):
        for text in (AND_EXAMPLE, NOT_EXAMPLE, SPLITTER_EXAMPLE, CUBE_EXAMPLE):
            bp = Blueprint.from_objects(json.loads(text))
            self.assertEqual(bp.validate(), [], text)

    def test_out_of_range_parent(self):
        bp = Blueprint()
        sw = bp.add("Switch")
        bp.objects[sw][1].append(["1", "1", 1])
        issues = bp.validate()
        self.assertTrue(any("references itself" in s for s in issues), issues)

    def test_bad_index(self):
        bp = Blueprint()
        sw = bp.add("Switch")
        gate = bp.add("Gate-AND")
        bp.connect(sw, 1, gate, 3)
        bp.objects.append(["Light", [["1", "1", 99]], {"Activated": False}])
        issues = bp.validate()
        self.assertTrue(any("out of 1.." in s for s in issues), issues)

    def test_unknown_socket_warns(self):
        bp = Blueprint()
        gate = bp.add("Gate-AND")
        sw = bp.add("Switch")
        bp.connect(sw, 7, gate, 9)
        issues = bp.validate()
        self.assertTrue(any("self socket 7" in s for s in issues), issues)
        self.assertTrue(any("socket 9" in s for s in issues), issues)


if __name__ == "__main__":
    unittest.main()
