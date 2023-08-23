import {
	Button,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogContentText,
	DialogTitle,
	LinearProgress,
	Fade,
} from "@mui/material";
import { useSession } from "next-auth/react";
import { useTranslation } from "next-i18next";
import { useEffect, useState } from "react";
import React from "react";
import type { Events, Calendar, Event } from "../../types/gapiCalendar";
import { GoogleCalendar, CalendarId } from "libs/googleCalendar";

let delete_event_url_list: string[];

type Props = {
	disabled: boolean;
};

export default React.memo(function AllDeleteButton({ disabled }: Props) {
	const { t } = useTranslation("components");
	const { t: cc } = useTranslation("common");
	const [isShowDialog, setIsShowDialog] = useState(false);
	const [deleteEventCout, setDeleteEventCout] = useState(0);
	const [deleteStatus, setDeleteStatus] = useState<
		"unauthenticated" | "ready" | "getting_calendar" | "deleting"
	>("unauthenticated");
	const [deleteCount, setDeleteCount] = useState(0);
	const { data: session, status: authStatus } = useSession();

	useEffect(() => {
		if (authStatus == "unauthenticated") setDeleteStatus("unauthenticated");
		else setDeleteStatus("ready");
	}, [authStatus]);

	const onAllDeleteClick = async () => {
		setDeleteStatus("getting_calendar");
		delete_event_url_list = [];
		// すべてのカレンダーを取得
		if (!(session && session.user)) return;
		const res: Response = await fetch(
			"https://www.googleapis.com/calendar/v3/users/me/calendarList",
			{
				method: "GET",
				headers: { Authorization: `Bearer ${session.accessToken}` },
			},
		);
		const all_calendar_list = (await res.json()).items;

		// すべてのカレンダーの予定を取得
		const all_events: Map<CalendarId, Event[]> = await GoogleCalendar.getAllEvents(
			all_calendar_list,
			session,
		);

		// 取得した予定の中から詳細に#created_by_dp2gcがあるものだけを残すようフィルタリング
		const delete_events: Map<CalendarId, Event[]> = all_events;
		let delete_count = 0;
		delete_events.forEach((events) => {
			delete_count += events.length;
		});
		setDeleteEventCout(delete_count);
		delete_events.forEach((events, calendar_id) => {
			for (const delete_event of events) {
				delete_event_url_list.push(
					`https://www.googleapis.com/calendar/v3/calendars/${calendar_id}/events/${delete_event.id}`,
				);
			}
		});

		// フィルタリングしたものを消していいかどうかホップアップを出す
		setIsShowDialog(true);
	};

	const handleClose = () => {
		setIsShowDialog(false);
		setDeleteStatus("ready");
	};

	const allDelete = async () => {
		setIsShowDialog(false);
		setDeleteStatus("deleting");
		setDeleteCount(0);
		if (!session) return;

		setDeleteStatus("ready");
	};

	return (
		<>
			<Button
				style={{ textTransform: "none" }}
				disabled={deleteStatus != "ready" || disabled}
				color='error'
				onClick={onAllDeleteClick}
			>
				{
					{
						unauthenticated: t("importModules.AllDeleteButton.unauthenticated"),
						ready: t("importModules.AllDeleteButton.label"),
						deleting: `${deleteCount}${cc("unit")}${t(
							"importModules.AllDeleteButton.deleted",
						)}`,
						getting_calendar: t("importModules.AllDeleteButton.searching"),
					}[deleteStatus]
				}
				<Fade in={deleteStatus == "getting_calendar"}>
					<CircularProgress />
				</Fade>
			</Button>
			<LinearProgress
				style={{ display: deleteStatus == "deleting" ? "inline" : "none" }}
				variant='determinate'
				value={(deleteCount / deleteEventCout) * 100}
			/>
			<Dialog
				open={isShowDialog}
				aria-labelledby='alert-dialog-title'
				aria-describedby='alert-dialog-description'
			>
				<DialogTitle id='alert-dialog-title'>
					{t("importModules.AllDeleteButton.title")}
				</DialogTitle>
				<DialogContent>
					<DialogContentText id='alert-dialog-description'>
						{`${t(
							"importModules.AllDeleteButton.events_added_by_digisync",
						)}(${deleteEventCout} ${cc("unit")})${t(
							"importModules.AllDeleteButton.delete",
						)}`}
					</DialogContentText>
				</DialogContent>
				<DialogActions>
					<Button onClick={handleClose} autoFocus>
						{cc("no")}
					</Button>
					<Button onClick={allDelete}>
						{t("importModules.AllDeleteButton.yes_delete")}
					</Button>
				</DialogActions>
			</Dialog>
		</>
	);
});
