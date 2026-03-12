import React, { useCallback, useRef } from 'react'
import Editor, { type Monaco } from '@monaco-editor/react'

/** Map file extensions to Monaco language IDs. */
function langFromFileName(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    css: 'css',
    html: 'html',
    xml: 'xml',
    rs: 'rust',
    toml: 'toml',
    py: 'python',
    sh: 'shell',
    bash: 'shell',
  }
  return map[ext] ?? 'plaintext'
}

const THEME_NAME = 'eerie-neon'

function defineTheme(monaco: Monaco) {
  monaco.editor.defineTheme(THEME_NAME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'e8e0f0' },
      { token: 'comment', foreground: '44405a', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'e040fb' },
      { token: 'string', foreground: '00ffaa' },
      { token: 'number', foreground: 'ffaa22' },
      { token: 'type', foreground: 'f06aff' },
      { token: 'variable', foreground: 'e8e0f0' },
      { token: 'function', foreground: '8878aa' },
      { token: 'operator', foreground: 'e040fb' },
      { token: 'delimiter', foreground: '8878aa' },
      { token: 'tag', foreground: 'e040fb' },
      { token: 'attribute.name', foreground: 'f06aff' },
      { token: 'attribute.value', foreground: '00ffaa' },
    ],
    colors: {
      'editor.background': '#06060a',
      'editor.foreground': '#e8e0f0',
      'editor.lineHighlightBackground': '#1c1c3040',
      'editor.selectionBackground': '#2a104080',
      'editor.inactiveSelectionBackground': '#2a104040',
      'editorCursor.foreground': '#e040fb',
      'editorLineNumber.foreground': '#44405a',
      'editorLineNumber.activeForeground': '#8878aa',
      'editorIndentGuide.background': '#2a2a4430',
      'editorIndentGuide.activeBackground': '#2a2a4480',
      'editorWidget.background': '#101018',
      'editorWidget.border': '#2a2a44',
      'input.background': '#0e0e18',
      'input.foreground': '#e8e0f0',
      'input.border': '#2a2a44',
      'focusBorder': '#e040fb',
      'list.activeSelectionBackground': '#2a104080',
      'list.hoverBackground': '#1c1c30',
      'scrollbarSlider.background': '#2a2a4440',
      'scrollbarSlider.hoverBackground': '#2a2a4480',
      'scrollbarSlider.activeBackground': '#e040fb40',
    },
  })
}

interface Props {
  fileName: string
  content: string
  onChange: (value: string) => void
  onSave?: () => void
}

export default function TextEditor({ fileName, content, onChange, onSave }: Props) {
  const themeReady = useRef(false)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) onChange(value)
    },
    [onChange],
  )

  const handleBeforeMount = useCallback((monaco: Monaco) => {
    if (!themeReady.current) {
      defineTheme(monaco)
      themeReady.current = true
    }
  }, [])

  const handleMount = useCallback((editor: any, monaco: Monaco) => {
    // Override Ctrl+S to call our save handler
    editor.addAction({
      id: 'eerie-save',
      label: 'Save',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => { onSaveRef.current?.() },
    })
  }, [])

  return (
    <Editor
      height="100%"
      language={langFromFileName(fileName)}
      value={content}
      onChange={handleChange}
      theme={THEME_NAME}
      beforeMount={handleBeforeMount}
      onMount={handleMount}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        automaticLayout: true,
      }}
    />
  )
}
