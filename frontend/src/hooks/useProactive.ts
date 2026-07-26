"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  generateSuggestions,
  detectPatterns,
  extractHabits,
  generateInsights,
  learningTick,
  recordInteraction,
  getLearnedContext,
  type ProactiveSuggestion,
  type Pattern,
  type UserHabit,
  type LearningInsight,
} from "@/lib/proactive";

export interface ProactiveState {
  suggestions: ProactiveSuggestion[];
  patterns: Pattern[];
  habits: UserHabit[];
  insights: LearningInsight[];
  lastCheck: string | null;
  isMonitoring: boolean;
}

export function useProactive() {
  const [state, setState] = useState<ProactiveState>({
    suggestions: [],
    patterns: [],
    habits: [],
    insights: [],
    lastCheck: null,
    isMonitoring: false,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seenRef = useRef<Set<string>>(new Set());

  // Run a full analysis cycle
  const analyze = useCallback(() => {
    const suggestions = generateSuggestions();
    const patterns = detectPatterns();
    const habits = extractHabits();
    const insights = generateInsights();

    setState(s => ({
      suggestions,
      patterns,
      habits,
      insights,
      lastCheck: new Date().toISOString(),
      isMonitoring: s.isMonitoring,
    }));
  }, []);

  // Start monitoring (periodic analysis)
  const startMonitoring = useCallback(() => {
    if (intervalRef.current) return;

    // Run learning tick on start
    learningTick();

    // Analyze immediately
    analyze();

    // Then every 5 minutes
    intervalRef.current = setInterval(() => {
      learningTick();
      analyze();
    }, 5 * 60 * 1000);

    setState(s => ({ ...s, isMonitoring: true }));
  }, [analyze]);

  // Stop monitoring
  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setState(s => ({ ...s, isMonitoring: false }));
  }, []);

  // Get unseen suggestions (for notification badges)
  const getUnseenSuggestions = useCallback((): ProactiveSuggestion[] => {
    return state.suggestions.filter(s => !seenRef.current.has(s.id));
  }, [state.suggestions]);

  // Mark a suggestion as seen
  const markSeen = useCallback((id: string) => {
    seenRef.current.add(id);
  }, []);

  // Record an interaction for learning
  const record = useCallback((kind: string, value: string, meta?: Record<string, unknown>) => {
    recordInteraction(kind, value, meta);
  }, []);

  // Get learned context string for AI
  const getContext = useCallback((): string => {
    return getLearnedContext();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Auto-start monitoring on mount
  useEffect(() => {
    startMonitoring();
    return () => stopMonitoring();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    ...state,
    analyze,
    startMonitoring,
    stopMonitoring,
    getUnseenSuggestions,
    markSeen,
    record,
    getContext,
  };
}
