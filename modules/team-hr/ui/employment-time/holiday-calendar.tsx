import { useTranslation } from "@engenty/i18n/ui";
import { Button, Card, Checkbox, Input, Label } from "@engenty/ui-core";
import {
  Calendar as CalendarIcon,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import { toast } from "sonner";
import type { PublicHoliday } from "../employment-time-queries.js";

interface HolidayCalendarProps {
  holidays: PublicHoliday[];
  jurisdiction: string;
  loading: boolean;
  onAddHoliday: (holiday: PublicHoliday) => Promise<unknown>;
  onDeleteHoliday: (id: string) => Promise<unknown>;
  year: number;
}

export function HolidayCalendar({
  holidays,
  loading,
  onAddHoliday,
  onDeleteHoliday,
  year,
  jurisdiction,
}: HolidayCalendarProps) {
  const { t, i18n } = useTranslation("team");
  const isDe = i18n.language === "de";

  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");
  const [newIsHalfDay, setNewIsHalfDay] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(newDate && newName.trim())) {
      toast.error(
        isDe
          ? "Datum und Name sind erforderlich."
          : "Date and Name are required."
      );
      return;
    }

    try {
      await onAddHoliday({
        date: newDate,
        name: newName.trim(),
        jurisdiction,
        is_half_day: newIsHalfDay,
      });
      setNewDate("");
      setNewName("");
      setNewIsHalfDay(false);
      setIsAdding(false);
      toast.success(
        isDe
          ? "Feiertag erfolgreich hinzugefügt."
          : "Public holiday added successfully."
      );
    } catch {
      toast.error(
        isDe
          ? "Fehler beim Hinzufügen des Feiertags."
          : "Failed to add public holiday."
      );
    }
  };

  const handleDelete = async (id: string) => {
    // biome-ignore lint/suspicious/noAlert: standard native confirm dialog is acceptable here
    const confirmed = window.confirm(
      isDe
        ? "Möchten Sie diesen Feiertag wirklich löschen?"
        : "Are you sure you want to delete this public holiday?"
    );
    if (confirmed) {
      try {
        await onDeleteHoliday(id);
        toast.success(isDe ? "Feiertag gelöscht." : "Public holiday deleted.");
      } catch {
        toast.error(isDe ? "Fehler beim Löschen." : "Failed to delete.");
      }
    }
  };

  return (
    <Card className="space-y-4 border-border/80 bg-card/65 p-5 shadow-sm backdrop-blur-md">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h3 className="flex items-center gap-2 font-semibold text-base">
            <CalendarIcon className="h-4.5 w-4.5 text-primary" />
            {t("employmentTime.publicHolidays")} ({jurisdiction} - {year})
            {loading && (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </h3>
          <p className="text-muted-foreground text-xs">
            {isDe
              ? "Feiertage reduzieren die Sollstunden der Mitarbeiter an den jeweiligen Tagen."
              : "Holidays reduce target hours for employees on these days automatically."}
          </p>
        </div>
        <Button
          className="gap-1 px-2.5 font-semibold text-xs"
          onClick={() => setIsAdding(!isAdding)}
          size="sm"
          variant={isAdding ? "ghost" : "outline"}
        >
          {isAdding ? (
            "Cancel"
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" /> {t("employmentTime.addHoliday")}
            </>
          )}
        </Button>
      </div>

      {/* Add Holiday Form */}
      {isAdding && (
        <form
          className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4"
          onSubmit={handleSubmit}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="holiday-date">
                {t("employmentTime.date")}
              </Label>
              <Input
                className="h-8.5 text-xs"
                id="holiday-date"
                onChange={(e) => setNewDate(e.target.value)}
                type="date"
                value={newDate}
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs" htmlFor="holiday-name">
                {t("employmentTime.name")}
              </Label>
              <Input
                className="h-8.5 text-xs"
                id="holiday-name"
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Ostermontag"
                value={newName}
              />
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={newIsHalfDay}
                id="holiday-half-day"
                onCheckedChange={(checked) => setNewIsHalfDay(!!checked)}
              />
              <Label
                className="cursor-pointer font-medium text-xs"
                htmlFor="holiday-half-day"
              >
                {t("employmentTime.isHalfDay")}
              </Label>
            </div>
            <Button
              className="h-8 font-semibold text-xs"
              size="sm"
              type="submit"
            >
              Save Holiday
            </Button>
          </div>
        </form>
      )}

      {/* Holidays List */}
      {loading && holidays.length === 0 ? (
        <div className="animate-pulse py-8 text-center text-muted-foreground text-xs">
          Loading holidays...
        </div>
      ) : holidays.length === 0 ? (
        <div className="rounded-xl border border-border border-dashed py-8 text-center text-muted-foreground text-xs">
          {t("employmentTime.noHolidays")}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 text-xs">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-border/60 border-b bg-muted/30 font-semibold text-muted-foreground">
                <th className="w-32 p-2.5">{t("employmentTime.date")}</th>
                <th className="p-2.5">{t("employmentTime.name")}</th>
                <th className="w-28 p-2.5 text-center">
                  {t("employmentTime.isHalfDay")}
                </th>
                <th className="w-20 p-2.5 text-center">
                  {t("employmentTime.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {holidays.map((h) => (
                <tr
                  className="border-border/40 border-b last:border-b-0 hover:bg-muted/10"
                  key={h.id}
                >
                  <td className="whitespace-nowrap p-2.5 font-medium">
                    {h.date}
                  </td>
                  <td className="p-2.5 font-medium text-foreground">
                    {h.name}
                  </td>
                  <td className="p-2.5 text-center">
                    <span
                      className={`rounded-full px-1.5 py-0.5 font-semibold ${
                        h.is_half_day
                          ? "bg-amber-500/10 text-amber-500"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {h.is_half_day ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="p-2.5 text-center">
                    <Button
                      className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => h.id && handleDelete(h.id)}
                      size="icon"
                      variant="ghost"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
