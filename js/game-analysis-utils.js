export function gameStatusLabel(status) {
  return {
    imported_only: "Imported only",
    quick_classified: "Quick classified",
    human_analysis_started: "Analysis started",
    human_analysis_complete: "Human analysis complete",
    engine_checked_later: "Engine checked later",
    lessons_extracted: "Lessons extracted",
    repairs_created: "Repairs created"
  }[status] || "Imported only";
}

export function checklistForGame(game, annotations = []) {
  const rows = annotations.filter(annotation => annotation.game_id === game?.id);

  return [
    { key: "pgn_imported", label: "PGN imported", done: Boolean(String(game?.pgn || "").trim()) },
    { key: "user_color_selected", label: "User color selected", done: ["white", "black"].includes(game?.user_color) },
    { key: "critical_moments_marked", label: "Critical moments marked", done: rows.some(annotation => annotation.is_critical) },
    { key: "human_notes_added", label: "Human notes added", done: rows.some(annotation => annotation.human_comment_before || annotation.human_comment_after) },
    { key: "lesson_extracted", label: "At least one lesson extracted", done: Boolean(String(game?.summary || "").trim()) || rows.some(annotation => annotation.lesson_flag) },
    { key: "positions_created", label: "Positions created if needed", done: rows.some(annotation => annotation.position_id) },
    { key: "mistakes_created", label: "Mistakes created if needed", done: rows.some(annotation => annotation.mistake_id) },
    { key: "repairs_created", label: "Repairs created if needed", done: rows.some(annotation => annotation.repair_id) },
    { key: "analysis_complete", label: "Game marked analysis complete", done: game?.analysis_complete === true }
  ];
}

export function checklistProgress(checklist = []) {
  const total = checklist.length;
  const done = checklist.filter(item => item.done).length;
  return {
    total,
    done,
    remaining: Math.max(0, total - done)
  };
}

export function gameNeedsWork(game, annotations = []) {
  return checklistForGame(game, annotations).some(item => !item.done);
}
