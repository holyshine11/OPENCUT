/**
 * UI strings. To translate a screen: move each visible English string here
 * under that screen's group, add the Korean in ko.ts under the same key, and
 * read it in the component with `const m = useMessages()` → `m.projects.newProject`.
 * Strings with values are functions taking one object, e.g. `({ query }) => ...`.
 * ko.ts is typed as `Messages`, so a key missing from either file fails tsc.
 */
export const en = {
	/** BCP 47 tag for dates and numbers */
	dateLocale: "en-US",
	language: {
		label: "Language",
		ko: "한국어",
		en: "English",
	},
	projects: {
		home: "Home",
		allProjects: "All projects",
		gridView: "Grid view",
		listView: "List view",
		selectAll: "Select all",
		sortAscending: "Sort ascending",
		sortDescending: "Sort descending",
		sortBy: {
			createdAt: "Created",
			updatedAt: "Modified",
			name: "Name",
			duration: "Duration",
		},
		search: "Search...",
		duplicate: "Duplicate",
		delete: "Delete",
		rename: "Rename",
		info: "Info",
		projectMenu: "Project menu",
		newProject: "New project",
		newProjectShort: "New",
		defaultProjectName: "New project",
		thumbnailAlt: "Project thumbnail",
		createdOn: ({ date }: { date: string }) => `Created ${date}`,
		noResults: "No results found",
		noResultsFor: ({ query }: { query: string }) =>
			`Your search for "${query}" did not return any results.`,
		clearSearch: "Clear search",
		noProjects: "No projects yet",
		noProjectsHint:
			"Start creating your first project. Import media, edit, and export your videos. All privately.",
		createFirst: "Create your first project",
		createFailed: "Failed to create project",
		tryAgain: "Please try again",
	},
};

export type Messages = typeof en;
