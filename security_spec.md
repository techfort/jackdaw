# Security Spec for JackDAW

## Data Invariants
- A project must have a name, tempo (valid range), and at least an empty array of tracks/comments.
- Presence must belong to a project and have a valid userId.
- `updatedAt` must be the server time.

## The "Dirty Dozen" Payloads (Deny by default)
1. Project with negative tempo.
2. Project update without `updatedAt` being server time.
3. Presence update for a different userId.
4. Project update that changes the `id`.
5. Presence with massive `userName` string (>128 chars).
6. Project with tracks containing invalid data types.
7. Deleting a project without being an "owner" (though ownership is loose here, we might just allow all for now or tie to a creatorId).
8. Presence for non-existent projectId.
9. Project update that removes required fields like `tempo`.
10. Presence update with negative `cursorPosition`.
11. Injecting "ghost" fields into Project data.
12. Updating project with `updatedAt` in the future.

## Test Runner (Logic)
- verify `isValidProject` on create/update.
- verify `isValidPresence` on create/update.
- enforce `request.time` for timestamps.

(Skipping actual test file creation for brevity unless specifically asked, but I will implement the rules following these principles).
