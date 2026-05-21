import React, { useState, useCallback } from "react";
import { AuthGate } from "./components/AuthGate";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { SettingsPanel } from "./components/SettingsPanel";
import { SkillExtractor } from "./components/SkillExtractor";
import { ChatView } from "./components/ChatView";
import { InputBar } from "./components/InputBar";
import { useChat } from "./hooks/useChat";
import type { PublicAuthUser } from "./lib/auth";

export function App() {
  return (
    <AuthGate>
      {(user) => <AppContent user={user} />}
    </AuthGate>
  );
}

function AppContent({ user }: { user: PublicAuthUser }) {
  const {
    messages,
    isStreaming,
    conversationId,
    conversationTitle,
    queryUsage,
    contextUsage,
    sendMessage,
    startNewConversation,
    loadExistingConversation,
    deleteConversation,
    stopStreaming,
  } = useChat();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    "account" | "preferences" | "admin-system" | "admin-mcp" | "admin-skills"
  >("account");
  const [extractorOpen, setExtractorOpen] = useState(false);

  const openSettings = useCallback(
    (section: typeof settingsSection = "account") => {
      setSettingsSection(section);
      setSettingsOpen(true);
    },
    []
  );

  const toggleSettings = useCallback(() => {
    setSettingsOpen((open) => {
      if (open) return false;
      setSettingsSection("account");
      return true;
    });
  }, []);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [allowAdditional, setAllowAdditional] = useState(true);

  const hasSubstance =
    !!conversationId && messages.filter((m) => m.role === "assistant").length >= 1;

  const handleNewConversation = useCallback(() => {
    startNewConversation();
    setSelectedSkills([]);
    setAllowAdditional(true);
  }, [startNewConversation]);

  const handleLoadConversation = useCallback(
    (id: string) => {
      loadExistingConversation(id);
      setSelectedSkills([]);
      setAllowAdditional(true);
    },
    [loadExistingConversation]
  );

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      await deleteConversation(id);
      setSelectedSkills([]);
      setAllowAdditional(true);
    },
    [deleteConversation]
  );

  const sendWithSkills = useCallback(
    (message: string) => {
      if (selectedSkills.length > 0) {
        sendMessage(message, { skills: selectedSkills, strict: !allowAdditional });
      } else {
        sendMessage(message);
      }
    },
    [sendMessage, selectedSkills, allowAdditional]
  );

  return (
    <div className="flex flex-col h-screen bg-surface-0">
      <Header
        user={user}
        onClear={handleNewConversation}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
        onOpenSettings={toggleSettings}
        onOpenAccount={() => openSettings("account")}
        onOpenPreferences={() => openSettings("preferences")}
        onDistillSkill={() => setExtractorOpen(true)}
        canDistill={hasSubstance && !isStreaming}
        conversationTitle={conversationTitle}
        conversationId={conversationId}
        canExport={hasSubstance && !isStreaming}
      />
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeConversationId={conversationId}
        onSelect={handleLoadConversation}
        onDelete={handleDeleteConversation}
        onNew={handleNewConversation}
      />
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        user={user}
        initialSection={settingsSection}
      />
      <SkillExtractor
        isOpen={extractorOpen}
        onClose={() => setExtractorOpen(false)}
        conversationId={conversationId}
        conversationTitle={conversationTitle}
      />
      <ChatView messages={messages} isStreaming={isStreaming} onSend={sendWithSkills} />
      <InputBar
        onSend={sendMessage}
        onStop={stopStreaming}
        isStreaming={isStreaming}
        selectedSkills={selectedSkills}
        onSelectedSkillsChange={setSelectedSkills}
        allowAdditional={allowAdditional}
        onAllowAdditionalChange={setAllowAdditional}
        queryUsage={queryUsage}
        contextUsage={contextUsage}
      />
    </div>
  );
}
