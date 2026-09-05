# Claude Code QA Review Prompt

I’m about to leave home for the next few hours, so I want you to use this time to perform a thorough, end-to-end QA review of the entire application.

This app is still **DEMO-ONLY** at this stage.

## Important

- All existing data is disposable demo/test data.
- You are free to create, modify, duplicate, archive, delete, reset, or otherwise manipulate any existing data as needed for testing.
- Do **not** hold back from destructive testing because of the current dataset.
- Data integrity is still extremely important, but what I care about is whether the application behaves correctly and keeps its data relationships/state consistent — not preserving the existing demo content.
- Feel free to create extreme or unusual test cases if that helps expose bugs.

This application is intended to eventually become a heavily used daily work-management tool for our team, so stability, reliability, data integrity, and UX consistency are extremely important.

Treat this as a serious pre-production QA pass, not a quick smoke test.

---

## Phase 0 — Inspect First

Before changing anything:

1. Inspect the entire repository.
2. Understand the architecture.
3. Understand all routes, features, components, state management, persistence, APIs, database/data models, and deployment setup.
4. Identify which features currently exist versus placeholders or incomplete functionality.
5. Inspect the current automated test setup.
6. Inspect the build/deployment configuration.
7. Inspect the application running locally.

Do not start fixing things immediately.

First give me a detailed QA plan covering everything you intend to test.

The plan should be comprehensive enough that I can review exactly what you will test before you begin.

After showing the plan, continue automatically with the full QA process. Do not wait for my approval unless you encounter something genuinely blocking.

---

## QA Plan Requirements

Your QA plan should cover every major feature, workflow, edge case, state, and failure mode you can identify.

### Authentication / Account

- Login
- Logout
- Account switching if supported
- Invalid credentials
- Missing account
- Session persistence
- Refresh while logged in
- Direct navigation to protected routes
- Access after logout
- Current-user switching in demo/development mode
- Any authentication-related edge cases

### Workspaces

- Open workspace
- Workspace navigation
- Workspace switching if supported
- Workspace settings
- Workspace membership
- Workspace roles
- Invalid workspace routes
- Archived/deleted workspace behaviour if applicable

### Teams

- Create team
- Rename team
- Edit team
- Change icon/color
- Add members
- Remove members
- Archive team
- Delete team if supported
- Multiple teams
- Users belonging to multiple teams
- Empty teams
- Team navigation
- Team-board relationships
- Moving boards between teams

### Members / Users

- Member listing
- Invite simulated member
- Change roles
- Add/remove team membership
- Deactivate user
- Avatar rendering
- Initials fallback
- Long names
- Missing profile data
- Duplicate names
- Multiple assignees

### Boards

Test boards heavily.

- Create board
- Rename board
- Edit description
- Favourite/unfavourite
- Duplicate board
- Archive board
- Delete board
- Restore if supported
- Change board team
- Change board visibility
- Board permissions
- Board members
- Empty board
- Large board
- Multiple boards
- Rapid switching between boards
- Refresh after board changes
- Deep linking
- Browser back/forward navigation
- Invalid board URL
- Deleted board URL
- Archived board URL

### Board Templates

Test each available board template.

- Blank
- Campaign
- Creative Production
- Any additional templates

Verify that:

- Correct groups are created
- Correct columns are created
- Positions/order are correct
- Default values are correct
- Template-created boards behave normally afterward

### Groups

- Create group
- Rename group
- Delete group
- Duplicate group
- Collapse/expand group
- Reorder groups
- Drag groups repeatedly
- Move groups
- Empty group
- Large group
- Duplicate group names
- Very long names
- Delete group containing items
- Check how dependent/related data behaves after deletion

### Items / Tasks

- Create item
- Rename item
- Edit item
- Delete item
- Archive item
- Duplicate item
- Move between groups
- Drag/reorder
- Repeated drag/reorder operations
- Create many items rapidly
- Empty item name
- Very long item name
- Special characters
- Unicode
- Duplicate names
- Rapid editing
- Refresh after editing
- Change board immediately after editing
- Delete item while selected
- Delete item referenced elsewhere
- Item detail panel
- Direct item/deep-link behaviour if supported

### Subitems

- Create subitem
- Edit subitem
- Delete subitem
- Reorder subitems
- Parent with no subitems
- Parent with many subitems
- Parent deletion
- Parent move
- Subitem state persistence
- Subitem status/owner/date/priority

### Columns

Test every supported column type individually.

At minimum:

- Text
- Long Text
- Status
- Person
- Date
- Timeline
- Number
- Priority
- Checkbox
- Link
- Tags
- Files placeholder/local files
- Dependency

For each column type test:

- Empty value
- Set value
- Update value
- Clear value
- Refresh persistence
- Invalid input
- Edge-case input
- Copying/duplicating item
- Deleting column
- Hiding column
- Showing column
- Renaming column
- Reordering columns
- Resizing columns if supported

Also verify deleting a column does not leave broken references or corrupt unrelated item data.

### Status

- Every status option
- Empty status
- Change status repeatedly
- Fast repeated changes
- Status filtering
- Status sorting
- Status in Kanban
- Status in My Work
- Status in item detail
- Status changes reflected everywhere immediately

### Priority

- Every priority level
- Empty priority
- Sorting
- Filtering
- Display consistency between views

### Person / Owner

- No owner
- One owner
- Multiple owners
- Search member picker
- Remove owner
- Add owner
- Inactive/deleted member
- My Work updates correctly
- Avatar overlap/rendering
- Long names

### Dates

- No date
- Today
- Past date
- Future date
- Overdue
- Far-future date
- Date changes
- Clearing date
- Date sorting
- Date filtering
- My Work date grouping

### Timelines

- Start only
- End only if allowed
- Valid range
- Same-day range
- End before start
- Very long range
- Clearing timeline
- Display consistency

### Dependencies

- Create dependency
- Remove dependency
- Multiple dependencies if supported
- Circular dependency attempts
- Self-dependency
- Dependency on deleted item
- Dependency on archived item
- Move dependent item
- Delete referenced item
- Blocked-state display

### Comments / Updates

- Add comment
- Edit comment
- Delete comment
- Empty comment
- Long comment
- Special characters
- Rapid commenting
- Comments after refresh
- Comments on deleted/archived item
- Ownership rules
- Mention UI placeholder if present

### Activity Log

Verify important actions generate correct human-readable activity.

Examples:

- Status changed
- Owner changed
- Date changed
- Priority changed
- Item moved
- Item created
- Item archived
- Comment added

Check:

- Actor
- Action description
- Previous value
- New value
- Timestamp
- Ordering
- Duplicate activity events
- Missing activity
- Misleading activity

### Notifications / Inbox

- Read
- Unread
- Mark one read
- Mark all read
- Open linked entity
- Missing/deleted linked entity
- Notification persistence
- Empty inbox
- Large notification count

### My Work

Test aggregation across multiple boards.

Check:

- Overdue
- Today
- This Week
- Later
- No Date
- Completed

Verify:

- Only relevant assigned tasks appear
- Multiple boards work correctly
- Owner changes update My Work
- Status changes update My Work
- Date changes update grouping
- Archived/deleted tasks disappear appropriately
- Filters/search if present
- Refresh consistency

### Filtering

Test all supported filters:

- Person
- Status
- Priority
- Date
- Group
- Combinations of filters
- Filter + search
- Filter + sort
- Filter + hidden columns
- Filter while editing
- Filter while dragging
- Clearing filters
- No-result state

### Sorting

Test:

- Name
- Due date
- Priority
- Status
- Created date
- Ascending/descending
- Empty values
- Duplicate values
- Sorting after editing
- Sorting after adding items
- Sorting after drag/drop

### Search

Test:

- Board search
- Task search
- Team search
- User search
- Global command search
- Partial matches
- Case sensitivity
- No matches
- Special characters
- Long queries
- Keyboard shortcut
- Navigation from result

### Bulk Actions

If supported:

- Select one
- Select many
- Select all
- Deselect
- Bulk move
- Bulk archive
- Bulk delete
- Mixed groups
- Filtered selection
- Selection after navigation
- Selection after deleted item
- Confirmation behaviour

### Drag and Drop

Test heavily.

#### Main Table

- Reorder within group
- Move between groups
- Reorder groups
- Repeated fast movement
- Drag first item
- Drag last item
- Empty target group
- Collapsed group
- Filtered board
- Sorted board
- Long board

#### Kanban

- Move between statuses
- Repeated moves
- Empty lane
- First/last card
- Refresh after move

Verify resulting order and underlying data, not just visual position.

### Kanban

- Correct status lanes
- Correct card status
- Drag card
- Owner display
- Priority display
- Due date
- Empty status
- Empty lane
- Large lane
- Changes synchronize with Main Table

### Timeline View

If implemented:

- Items appear correctly
- Dates/ranges correct
- No-date items handled correctly
- Changes synchronized with main table
- Responsive/scroll behaviour

### Calendar View

If implemented:

- Correct dates
- Multiple items same day
- Overdue items
- No-date tasks
- Month navigation
- Item opening
- Updates synchronized

### Files

If local/demo file support exists:

- Add attachment
- Remove attachment
- Filename
- Size
- MIME type
- Duplicate filenames
- Unsupported file types
- Deleted item behaviour

Do not worry about preserving existing demo attachments/data.

### Permissions

Test every defined role and permission combination.

Workspace roles:

- `OWNER`
- `ADMIN`
- `MEMBER`
- `GUEST`

Board roles:

- `OWNER`
- `EDITOR`
- `VIEWER`

Test:

- View
- Edit
- Delete
- Create
- Member management
- Workspace management
- Board management
- Private board visibility
- Unauthorized direct URL access

Do not only hide buttons.

Verify the underlying operations are actually prevented when required.

---

## Data Integrity / State Consistency

This is demo-only, so you may freely destroy or reset existing data.

However, test data integrity extensively.

What matters here is application correctness and consistency.

Try to expose issues such as:

- Orphaned records
- Stale references
- Duplicated records
- Incorrect ordering
- Inconsistent IDs
- Broken parent-child relationships
- Stale cached data
- Changes appearing in one view but not another
- Deleted data still appearing elsewhere
- Archived data leaking into active views
- Activity referring to missing objects
- Notifications linking to invalid objects
- My Work showing incorrect tasks
- Dependency references breaking
- Duplicated mutations
- Lost updates
- Refresh losing changes
- State reverting unexpectedly

Test scenarios such as:

- Refresh immediately after editing
- Refresh after drag/drop
- Refresh after creating
- Refresh after deleting
- Rapidly changing values
- Creating then deleting immediately
- Moving tasks repeatedly
- Changing filters while editing
- Switching boards immediately after editing
- Deleting an item referenced by dependencies
- Deleting a group containing many items
- Deleting a column containing values
- Duplicate names everywhere
- Empty values
- Long text
- Many assignees
- Archived objects
- Reopened app after many mutations
- Switching users after changes

Because this is demo data, feel free to intentionally stress and break the dataset in order to test recovery and consistency.

If useful, reset the demo data and repeat tests.

---

## Local Persistence

Test persistence extensively.

Verify:

- Data survives refresh
- Data survives navigation
- Data survives closing/reopening page where possible
- Current board state is correct after reload
- Sidebar state persists if intended
- Active view persists if intended
- Filters persist only if intentionally designed to
- Corrupted/missing local data is handled gracefully
- Demo reset works correctly

---

## Routing / Navigation

Test:

- All navigation links
- Browser back
- Browser forward
- Refresh on every major route
- Deep links
- Invalid IDs
- Deleted entities
- Archived entities
- Direct protected route
- Command palette navigation
- Links from notifications
- Links from My Work

Look for:

- Blank pages
- Stale UI
- Wrong breadcrumbs
- Wrong active navigation
- Crashes
- Unexpected redirects

---

## Error Handling

Test error states where possible.

Verify:

- Useful user-facing error message
- Retry behaviour
- Application does not become unusable
- Failed mutations do not leave false UI state
- Optimistic updates rollback correctly
- Console contains useful debugging information
- Errors are not silently swallowed

Do **not** “fix” console errors by hiding them.

Resolve their root cause.

---

## UI / UX Audit

Perform a separate, detailed UI/UX review across the entire product.

Check every page and major component.

Look for:

- Inconsistent spacing
- Inconsistent typography
- Inconsistent font sizes
- Inconsistent weights
- Misalignment
- Inconsistent component styling
- Inconsistent borders
- Inconsistent border radius
- Inconsistent shadows
- Inconsistent colors
- Poor contrast
- Broken hover states
- Broken focus states
- Broken active states
- Missing disabled states
- Awkward dropdown positioning
- Awkward popover positioning
- Menus cut off by viewport
- Clipped content
- Overflowing text
- Horizontal scroll bugs
- Vertical scroll bugs
- Nested scroll problems
- Layout shifts
- Flickering
- Modal/dialog problems
- Inconsistent modal sizing
- Broken responsive behaviour
- Unclear hierarchy
- Confusing labels
- Confusing interactions
- Buttons that appear clickable but do nothing
- Controls with no feedback
- Inconsistent icons
- Inconsistent terminology
- Poor empty states
- Bad loading states
- Visual glitches during drag/drop
- Table alignment problems
- Incorrect column widths
- Sticky header problems
- Sticky toolbar problems
- Sidebar issues
- Truncation problems
- Tooltip issues
- Inconsistent row height
- Inconsistent menu styling
- Inconsistent item detail panels
- Unexpected page jumps
- Bad transitions
- Overly large whitespace
- Excessively dense areas
- Anything visually unfinished

---

## Board / Table UX — Extra Attention

The board/table interface is the core daily-working surface.

Test this much more heavily than the rest of the application.

Create realistic stress cases:

- Many groups
- Many rows
- Many columns
- Long task names
- Long board names
- Long group names
- Multiple assignees
- Empty values
- Overdue dates
- Collapsed groups
- Hidden columns
- Multiple filters
- Sorting
- Horizontal scrolling
- Narrow viewport
- Resizing window
- Rapid inline editing
- Rapid drag/drop
- Editing while filtered
- Opening/closing detail panels
- Switching views repeatedly

The board should remain understandable, stable, responsive, and visually consistent.

---

## Responsive Testing

Test at least:

- 1440px desktop
- 1280px
- 1024px
- Smaller tablet width
- Narrow/mobile width if supported

Check:

- Sidebar collapse
- Toolbar overflow
- Table horizontal scroll
- Dialogs
- Dropdowns
- Item detail panel
- Command palette
- Navigation
- Kanban
- My Work

---

## Accessibility

Perform practical accessibility checks.

At minimum:

- Keyboard navigation
- Tab order
- Visible focus
- Enter/Space activation
- Escape to close dialogs/popovers
- Proper buttons instead of clickable divs
- Labels for controls
- Accessible dialogs
- ARIA where necessary
- Contrast
- Keyboard editing
- Keyboard modal navigation

Fix obvious accessibility problems.

---

## Performance

Look for noticeable performance issues.

Especially:

- Large boards
- Typing into cells
- Changing status
- Filtering
- Sorting
- Opening detail panel
- Dragging
- Switching boards
- Kanban

Inspect for obvious unnecessary rerenders or expensive computations.

Do not prematurely rewrite the entire architecture for theoretical optimization.

Fix problems that are measurable or clearly harmful.

---

## Automated Quality Checks

Run all applicable checks.

At minimum:

- Lint
- Typecheck
- Unit tests
- Component tests
- E2E tests
- Production build

Use the actual scripts defined in the project.

If important test coverage is missing, add useful automated tests for critical behaviour.

Do not create meaningless tests purely to increase test count.

Prioritize tests for:

- Persistence
- Board operations
- Item mutation
- Filtering
- Sorting
- Permissions
- My Work
- Drag/drop behaviour where practical
- Important regressions discovered during QA

---

## Bug Fix Process

For every issue found:

1. Document the issue.
2. Assign severity.
3. Reproduce it reliably.
4. Identify the root cause.
5. Fix the root cause rather than masking the symptom.
6. Run targeted tests.
7. Retest manually.
8. Test neighbouring functionality for regressions.
9. Confirm the fix.
10. Continue testing the rest of the app.

Do **not** stop after finding and fixing the first batch of bugs.

Complete the entire QA plan.

---

## Severity Levels

### CRITICAL

Data loss, corrupt state, severe permission issue, security issue, app unusable, major unrecoverable failure.

### HIGH

Major feature broken, common workflow unreliable, serious navigation/state issue.

### MEDIUM

Functional bug or UX problem that affects normal use but has a workaround.

### LOW

Minor visual inconsistency, polish issue, rare edge case, cosmetic defect.

---

## QA Log

Maintain a running QA log.

For every meaningful test or issue, record:

- Area
- Test
- Result
- Issue found
- Severity
- Root cause
- Fix applied
- Retest result

Keep this structured enough that it can be reviewed later.

---

## Regression Pass

After the first full QA/fix pass is complete, perform a **second regression pass**.

At minimum retest:

- Login
- Workspace load
- Team navigation
- Board navigation
- Create board
- Create item
- Edit item
- Change status
- Change owner
- Change priority
- Change date
- Drag item
- Move between groups
- Filters
- Sorting
- Search
- Item detail panel
- Comments
- My Work
- Notifications
- Kanban
- Refresh persistence
- Destructive operations
- Permissions
- Responsive board behaviour

The purpose is to catch problems introduced by your own fixes.

---

## Git / Commit Requirements

Once the local QA pass and fixes are in a stable state:

1. Review the git diff.
2. Make sure no debug code, temporary hacks, accidental files, secrets, or unnecessary generated files are included.
3. Run the full local quality suite again.
4. Commit the completed QA/fix work.

Use a clear commit message describing the QA/stability pass.

If multiple commits make more sense because there are clearly separate fixes, that is acceptable, but keep the history clean and understandable.

Do not commit a knowingly broken state.

---

## Deployment Testing

After the fixes are committed, test the deployed version as well.

This is important.

Inspect the repository and determine the existing deployment workflow/platform.

Use the existing deployment process rather than inventing a new hosting setup.

If deployment happens automatically after pushing/committing according to the existing workflow:

- Allow/use that workflow
- Verify the deployment succeeds
- Open the deployed application
- Run a production smoke test

If a manual deployment command is already part of the project workflow, use it appropriately.

Do not expose or commit secrets.

If authentication/permissions genuinely prevent you from triggering or accessing the deployment, clearly report that as a blocker rather than pretending it was tested.

On the deployed version, test at minimum:

- App loads
- No fatal runtime errors
- Login/demo user selection
- Workspace opens
- Board opens
- Create/edit task
- Change status
- Assign user
- Drag/move task
- Filtering
- Sorting
- Item detail
- Comments
- My Work
- Kanban
- Refresh persistence
- Navigation
- Direct URL/deep link
- Major responsive layout
- Browser console
- Failed network/resource requests
- Production-only errors

Also compare deployed behaviour against local behaviour.

Pay attention to issues that may only appear after deployment, including:

- Route handling
- Static/dynamic rendering
- Hydration
- Environment variables
- Build-time differences
- Asset paths
- Case-sensitive filenames
- Browser-only APIs
- IndexedDB/local persistence
- Caching
- Stale assets
- Production minification issues
- Console errors
- 404s
- Redirect loops

---

## Deployment Fix Loop

If you discover deployment-only bugs:

1. Reproduce them.
2. Identify the cause.
3. Fix locally.
4. Test locally.
5. Run quality checks.
6. Commit the fix.
7. Redeploy.
8. Retest deployment.

Repeat until the deployed app is stable or you encounter a genuine external blocker.

Do not declare success based only on local testing.

---

## Demo Data During Deployment Testing

The deployed application is also currently **DEMO-ONLY**.

You may freely:

- Create tasks
- Edit tasks
- Delete tasks
- Archive things
- Create boards
- Delete boards
- Change assignments
- Create test teams
- Reset demo data
- Generate stress-test content

Do whatever is useful to test the system properly.

There is no requirement to preserve the existing demo dataset.

Again, data integrity testing here means ensuring the application behaves correctly and consistently under mutations — not preserving the current demo content.

---

## Do Not Do These Things

Do not:

- Disable features just to make tests pass
- Delete functionality because it is difficult to test
- Hide console errors
- Suppress TypeScript errors without fixing the cause
- Blanket-disable ESLint rules
- Replace functioning architecture with a rushed rewrite
- Claim something was tested when it was only code-reviewed
- Assume something works because the implementation looks correct
- Ignore edge cases because the app is currently a demo
- Preserve bad demo data at the expense of testing
- Skip deployment testing after local success
- Stop after fixing only obvious issues

---

## Final QA Report

When everything is complete, give me a final report containing:

### 1. QA Summary

- Total areas tested
- Major workflows tested
- Automated tests executed
- Local testing completed
- Deployment testing completed

### 2. Bug Summary

- Total bugs found
- CRITICAL count
- HIGH count
- MEDIUM count
- LOW count

### 3. Fix Summary

- Bugs fixed
- Remaining bugs
- Intentionally deferred issues
- External blockers

### 4. Data Integrity

- Persistence findings
- Stale-state findings
- Deletion/reference findings
- Cross-view synchronization findings
- Any corruption risks discovered

### 5. UI / UX

- Visual issues corrected
- Interaction issues corrected
- Responsive issues
- Accessibility findings
- Remaining polish opportunities

### 6. Performance

- Issues found
- Fixes made
- Areas that may need future optimization

### 7. Automated Quality

Report actual results for:

- Lint
- Typecheck
- Unit tests
- Component tests
- E2E
- Production build

### 8. Git

Report:

- Commit(s) created
- Commit hash(es)
- Concise description of each

### 9. Deployment

Report:

- Deployment method/platform
- Whether deployment succeeded
- Deployed version tested
- Deployment-specific issues found
- Deployment-specific fixes made
- Any blockers

### 10. Remaining Technical Debt

Only include meaningful items.

### 11. Release Confidence

Choose exactly one:

- **READY FOR DAILY TEAM USE**
- **READY FOR DAILY TEAM USE WITH MINOR KNOWN ISSUES**
- **NEEDS MORE WORK BEFORE TEAM USE**
- **NOT SAFE FOR TEAM USE**

Explain the rating clearly.

---

## Final Principle

Do not rush this.

Do not assume the happy path is enough.

Try to break the application.

Use the fact that all current data is disposable to test aggressively.

Create weird states.

Delete things.

Move things repeatedly.

Refresh at inconvenient moments.

Use long values.

Use empty values.

Switch users.

Switch boards.

Stress the table.

Test relationships.

Test persistence.

Test locally.

Fix problems properly.

Commit the fixes.

Then test the actual deployment.

When a bug is fixed, verify the fix and check for regressions before moving on.

Start by inspecting the entire project and presenting the complete QA/testing plan.

After that, proceed through the QA process automatically.
