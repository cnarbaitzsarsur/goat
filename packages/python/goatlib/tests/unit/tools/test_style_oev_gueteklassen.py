"""Unit tests for ÖV-Güteklassen layer style generation."""

from goatlib.tools.style import get_oev_gueteklassen_style


class TestOevGueteklassenStyle:
    """Test dynamic and backward-compatible ÖV style mappings."""

    def test_preserves_legacy_a_to_f_colors(
        self: "TestOevGueteklassenStyle",
    ) -> None:
        """A-F classes should keep the established legacy color mapping."""
        style = get_oev_gueteklassen_style()
        color_map = {
            entry[0][0]: entry[1] for entry in style["color_range"]["color_map"]
        }

        assert color_map["A"] == "#199741"
        assert color_map["B"] == "#8BCC62"
        assert color_map["C"] == "#DCF09E"
        assert color_map["D"] == "#FFDF9A"
        assert color_map["E"] == "#F69053"
        assert color_map["F"] == "#E4696A"
        assert "G" not in color_map

    def test_generates_colors_beyond_f(
        self: "TestOevGueteklassenStyle",
    ) -> None:
        """Style should include additional classes (e.g. G) for scalable configs."""
        style = get_oev_gueteklassen_style(class_count=26)
        color_map = {
            entry[0][0]: entry[1] for entry in style["color_range"]["color_map"]
        }

        assert "G" in color_map
        assert "Z" in color_map
        assert color_map["G"] != color_map["F"]
        assert len(style["color_range"]["colors"]) == len(
            style["color_range"]["color_map"]
        )
