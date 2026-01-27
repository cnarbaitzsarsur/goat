"use client";

import { Delete as DeleteIcon, ContentCopy as DuplicateIcon } from "@mui/icons-material";
import { Box, Divider, IconButton, Paper, Portal, Stack, useTheme } from "@mui/material";
import { styled } from "@mui/material/styles";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import type { Editor } from "@tiptap/react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { type NodeProps, NodeResizer } from "@xyflow/react";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import { v4 as uuidv4 } from "uuid";

import { ICON_NAME } from "@p4b/ui/components/Icon";

import type { AppDispatch } from "@/lib/store";
import { selectNodes } from "@/lib/store/workflow/selectors";
import { addNode, removeNodes, updateNode } from "@/lib/store/workflow/slice";
import { rgbToHex } from "@/lib/utils/helpers";
import type { TextAnnotationNodeData } from "@/lib/validations/workflow";

import type { RGBColor } from "@/types/map/color";

import { ArrowPopper } from "@/components/ArrowPoper";
import { AlignSelect } from "@/components/builder/widgets/elements/text/AlignSelect";
import { BlockTypeSelect } from "@/components/builder/widgets/elements/text/BlockTypeSelect";
import MenuButton from "@/components/builder/widgets/elements/text/MenuButton";
import SingleColorSelector from "@/components/map/panels/style/color/SingleColorSelector";

// TipTap extensions
const extensions = [
  StarterKit,
  Subscript,
  Superscript,
  Underline,
  TextAlign.configure({
    types: ["heading", "paragraph"],
  }),
];

const TipTapEditorContent = styled(EditorContent)(({ theme }) => ({
  flexGrow: 1,
  height: "100%",
  overflow: "hidden",
  wordBreak: "break-word",
  overflowWrap: "break-word",
  // Use theme text color for proper light/dark mode support
  color: theme.palette.text.primary,
  "& .ProseMirror": {
    wordBreak: "break-word",
    overflowWrap: "break-word",
    padding: 0,
    margin: 0,
    height: "100%",
    boxSizing: "border-box",
    outline: "none",
    color: theme.palette.text.primary,
    "& p, & h1, & h2, & h3, & h4, & h5, & h6": {
      margin: 0,
      color: theme.palette.text.primary,
    },
    "& h2": {
      fontSize: "1.5rem",
      fontWeight: 600,
      marginBottom: "0.5rem",
    },
    "& p:first-of-type, & h1:first-of-type, & h2:first-of-type, & h3:first-of-type": {
      marginTop: 0,
    },
  },
  "& > .ProseMirror-focused": {
    outline: "none",
  },
}));

const NodeContainer = styled(Box, {
  shouldForwardProp: (prop) => prop !== "selected" && prop !== "backgroundColor",
})<{ selected?: boolean; backgroundColor?: string }>(({ theme, selected, backgroundColor }) => {
  const baseBgColor = backgroundColor || "#FFF8E1";

  return {
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius,
    // 5% opacity background
    backgroundColor: `${baseBgColor}0D`, // 0D = 5% opacity in hex
    // Visible border using the background color at higher opacity
    border: `2px solid ${baseBgColor}`,
    // Box-shadow for selection indicator (blue glow like in the example)
    boxShadow: selected ? `0 0 0 4px ${theme.palette.primary.main}40` : "none",
    height: "100%",
    width: "100%",
    boxSizing: "border-box",
    overflow: "hidden",
    transition: "box-shadow 0.2s ease",
  };
});

const ActionBar = styled(Stack)(({ theme }) => ({
  position: "absolute",
  top: -36,
  right: 0,
  backgroundColor: theme.palette.background.paper,
  borderRadius: theme.shape.borderRadius,
  padding: theme.spacing(0.5),
  gap: theme.spacing(0.5),
  flexDirection: "row",
  boxShadow: theme.shadows[4],
  border: `1px solid ${theme.palette.divider}`,
  zIndex: 10,
}));

const ActionButton = styled(IconButton)(({ theme }) => ({
  padding: theme.spacing(0.5),
  "&:hover": {
    backgroundColor: theme.palette.action.hover,
  },
  "& svg": {
    fontSize: 18,
  },
}));

const ToolbarContainer = styled(Paper)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  padding: theme.spacing(2),
  borderRadius: theme.shape.borderRadius * 2,
  boxShadow: theme.shadows[4],
  backgroundColor: theme.palette.background.paper,
}));

const ColorPickerButton = styled(Box, {
  shouldForwardProp: (prop) => prop !== "buttonColor",
})<{ buttonColor: string }>(({ theme, buttonColor }) => ({
  width: 24,
  height: 24,
  borderRadius: 4,
  backgroundColor: buttonColor,
  border: `1px solid ${theme.palette.divider}`,
  cursor: "pointer",
  transition: "transform 0.1s ease",
  "&:hover": {
    transform: "scale(1.1)",
  },
}));

interface TextAnnotationNodeProps extends NodeProps {
  data: TextAnnotationNodeData;
}

const TextAnnotationNode: React.FC<TextAnnotationNodeProps> = ({ id, data, selected }) => {
  const { t } = useTranslation("common");
  const theme = useTheme();
  const dispatch = useDispatch<AppDispatch>();
  const nodes = useSelector(selectNodes);

  const [isEditMode, setIsEditMode] = useState(false);
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [toolbarPosition, setToolbarPosition] = useState({ top: 0, left: 0 });

  const editor = useEditor({
    extensions,
    content: data.text || "<p></p>",
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editable: isEditMode,
    onUpdate: ({ editor }) => {
      // Save content on change
      dispatch(
        updateNode({
          id,
          changes: { data: { ...data, text: editor.getHTML() } },
        })
      );
    },
  });

  // Update editor editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(isEditMode);
    }
  }, [editor, isEditMode]);

  // Sync editor content when data changes externally
  useEffect(() => {
    if (editor && data.text !== undefined && !isEditMode) {
      const currentContent = editor.getHTML();
      if (currentContent !== data.text) {
        editor.commands.setContent(data.text || "<p></p>");
      }
    }
  }, [editor, data.text, isEditMode]);

  // Show toolbar when node is selected
  useEffect(() => {
    if (selected) {
      setToolbarOpen(true);
      setIsEditMode(true);
      // Focus editor when selected
      setTimeout(() => {
        editor?.commands.focus();
      }, 50);
    } else {
      setToolbarOpen(false);
      setIsEditMode(false);
      setColorPickerOpen(false); // Close color picker when deselected
    }
  }, [selected, editor]);

  // Handle editor focus/blur
  useEffect(() => {
    if (!editor) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleBlur = ({ event }: any) => {
      // Don't close toolbar if clicking on toolbar or color picker
      if (
        event?.relatedTarget &&
        ((event.relatedTarget as HTMLElement).closest(".tiptap-toolbar") ||
          (event.relatedTarget as HTMLElement).closest(".color-picker-popper"))
      ) {
        return;
      }
      // Don't close if color picker is open or node is selected
      if (colorPickerOpen || selected) return;
      setToolbarOpen(false);
      setIsEditMode(false);
    };

    editor.on("blur", handleBlur);

    return () => {
      editor.off("blur", handleBlur);
    };
  }, [editor, colorPickerOpen, selected]);

  // Update toolbar position
  useEffect(() => {
    if (!toolbarOpen || !containerRef.current) return;

    const updatePosition = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setToolbarPosition({
          top: rect.top - 8,
          left: rect.left + rect.width / 2,
        });
      }
    };

    updatePosition();
    let animationId: number;
    const animate = () => {
      updatePosition();
      animationId = requestAnimationFrame(animate);
    };
    animationId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationId);
  }, [toolbarOpen]);

  const editorState = useEditorState({
    editor,
    selector: ({ editor }: { editor: Editor }) => ({
      isBold: editor.isActive("bold"),
      isItalic: editor.isActive("italic"),
      isUnderline: editor.isActive("underline"),
      isStrike: editor.isActive("strike"),
      isSuperscript: editor.isActive("superscript"),
      isSubscript: editor.isActive("subscript"),
    }),
  });

  // Handle duplicate
  const handleDuplicate = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      const node = nodes.find((n) => n.id === id);
      if (!node) return;

      dispatch(
        addNode({
          ...node,
          id: `text-${uuidv4()}`,
          position: {
            x: node.position.x + 50,
            y: node.position.y + 50,
          },
        })
      );
    },
    [id, nodes, dispatch]
  );

  // Handle delete
  const handleDelete = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      dispatch(removeNodes([id]));
    },
    [id, dispatch]
  );

  // Handle background color change from SingleColorSelector
  const handleColorChange = useCallback(
    (rgb: RGBColor) => {
      const hexColor = rgbToHex(rgb);
      dispatch(
        updateNode({
          id,
          changes: { data: { ...data, backgroundColor: hexColor } },
        })
      );
    },
    [id, data, dispatch]
  );

  // Handle resize
  const handleResize = useCallback(
    (_: unknown, params: { width: number; height: number }) => {
      dispatch(
        updateNode({
          id,
          changes: { data: { ...data, width: params.width, height: params.height } },
        })
      );
    },
    [id, data, dispatch]
  );

  // Get current color as hex for the color picker
  const currentColorHex = data.backgroundColor || "#FFF8E1";

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={100}
        onResize={handleResize}
        handleStyle={{
          width: 10,
          height: 10,
          backgroundColor: theme.palette.primary.main,
          borderRadius: 2,
          zIndex: 20,
        }}
        lineStyle={{
          // Use transparent line - we handle selection with box-shadow on the NodeContainer
          borderColor: "transparent",
          borderWidth: 0,
        }}
      />

      <Box
        ref={containerRef}
        sx={{
          width: data.width || 400,
          height: data.height || 200,
          position: "relative",
        }}>
        {/* Action buttons - only when selected */}
        {selected && (
          <ActionBar>
            <ActionButton onClick={handleDuplicate} title={t("duplicate")}>
              <DuplicateIcon />
            </ActionButton>
            <ActionButton onClick={handleDelete} title={t("delete")}>
              <DeleteIcon />
            </ActionButton>
          </ActionBar>
        )}

        <NodeContainer selected={selected} backgroundColor={data.backgroundColor}>
          <TipTapEditorContent
            editor={editor}
            sx={{
              overflowY: isEditMode ? "auto" : "hidden",
              userSelect: isEditMode ? "auto" : "none",
              pointerEvents: isEditMode ? "auto" : "none",
              cursor: isEditMode ? "text" : "default",
              "& .ProseMirror": {
                userSelect: isEditMode ? "auto" : "none",
                pointerEvents: isEditMode ? "auto" : "none",
              },
            }}
          />
        </NodeContainer>
      </Box>

      {/* Floating toolbar */}
      {toolbarOpen && (
        <Portal>
          <Box
            className="tiptap-toolbar"
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            sx={{
              position: "fixed",
              top: toolbarPosition.top,
              left: toolbarPosition.left,
              transform: "translate(-50%, -100%)",
              zIndex: 1500,
              pointerEvents: "auto",
            }}>
            <ToolbarContainer>
              {editor && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <BlockTypeSelect
                    editor={editor}
                    onOpen={() => setActiveDropdown("blockType")}
                    onClose={() => setActiveDropdown(null)}
                    forceClose={activeDropdown !== "blockType" && activeDropdown !== null}
                  />
                  <Divider flexItem orientation="vertical" />
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <MenuButton
                      value="bold"
                      iconName={ICON_NAME.BOLD}
                      selected={editorState?.isBold}
                      onClick={() => editor.chain().focus().toggleBold().run()}
                    />
                    <MenuButton
                      value="italic"
                      iconName={ICON_NAME.ITALIC}
                      selected={editorState?.isItalic}
                      onClick={() => editor.chain().focus().toggleItalic().run()}
                    />
                    <MenuButton
                      value="underline"
                      iconName={ICON_NAME.UNDERLINE}
                      selected={editorState?.isUnderline}
                      onClick={() => editor.chain().focus().toggleUnderline().run()}
                    />
                  </Stack>
                  <Divider flexItem orientation="vertical" />
                  <AlignSelect
                    editor={editor}
                    onOpen={() => setActiveDropdown("align")}
                    onClose={() => setActiveDropdown(null)}
                    forceClose={activeDropdown !== "align" && activeDropdown !== null}
                  />
                  <Divider flexItem orientation="vertical" />
                  {/* Background color picker */}
                  <ArrowPopper
                    open={colorPickerOpen}
                    placement="bottom"
                    arrow={false}
                    isClickAwayEnabled={true}
                    onClose={() => setColorPickerOpen(false)}
                    content={
                      <Paper
                        className="color-picker-popper"
                        sx={{
                          py: 3,
                          boxShadow: "rgba(0, 0, 0, 0.16) 0px 6px 12px 0px",
                          width: "235px",
                          maxHeight: "500px",
                        }}>
                        <SingleColorSelector
                          selectedColor={currentColorHex}
                          onSelectColor={handleColorChange}
                        />
                      </Paper>
                    }>
                    <ColorPickerButton
                      buttonColor={currentColorHex}
                      onClick={() => setColorPickerOpen(!colorPickerOpen)}
                      title={t("color")}
                    />
                  </ArrowPopper>
                </Stack>
              )}
            </ToolbarContainer>
          </Box>
        </Portal>
      )}
    </>
  );
};

export default memo(TextAnnotationNode);
