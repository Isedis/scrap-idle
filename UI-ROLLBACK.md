# Operator guidance rollback

Baseline: `6d7e1aa`, branch `backup/ui-before-2026-10-31`.
Changes are isolated on `ui/operator-guidance`.

To inspect the previous UI locally with a clean working tree:

```sh
git switch backup/ui-before-2026-10-31
npm run build
```

To return to the new UI:

```sh
git switch ui/operator-guidance
npm run build
```

If these changes are later merged, revert the UI commit instead of resetting shared history.
No save schema, game balance, or player storage has been changed. Switching UI versions does not require deleting saves.

## In-game rollback

Settings → «Вернуть прежний интерфейс» restores the previous presentation immediately.
The same button enables the new interface again. This preference is stored per device
in `scrap-idle-classic-ui`, separately from the game save. Updates remain available
in both modes. This switches the UI, not the deployed code version.
