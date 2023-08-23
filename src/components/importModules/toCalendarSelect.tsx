import {
	FormControl,
	FormHelperText,
	InputLabel,
	MenuItem,
	Select,
	SelectChangeEvent,
} from "@mui/material";
import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";
import React, { ReactNode, useEffect, useState } from "react";
import { UseFormRegister } from "react-hook-form";

import { useCustomSession } from "@/hooks/useCustomSession";
import { GoogleCalendar } from "@/libs/googleCalendar";
import { FormInputs, GoogleFormInputs } from "@/types/formInputsTypes";
import { CalendarListEntry } from "@/types/gapiCalendar";

type Props = {
	disabled: boolean;
	errorMessage: string | undefined;
	onChange: (event: SelectChangeEvent<string>, child: ReactNode) => void;
	register: UseFormRegister<FormInputs> | UseFormRegister<GoogleFormInputs>;
	setAccessToken: (accessToken: string) => void;
	value: string;
};

const ToCalendarSelect = React.memo(function ToCalendarSelect({
	register,
	disabled,
	errorMessage,
	value,
	onChange,
	setAccessToken,
}: Props) {
	const { t } = useTranslation("components");
	const [calendars, setCalendars] = useState<Array<CalendarListEntry>>([]);
	const { session } = useCustomSession();
	const router = useRouter();

	useEffect(() => {
		(async () => {
			setCalendars(await GoogleCalendar.getMyCalendarList(session, router));
			setAccessToken(session.accessToken);
		})();
	}, [router, session, setAccessToken]);

	return (
		<FormControl fullWidth margin='normal'>
			<InputLabel id='to-calendar-list-label'>
				{t("importModules.ToCalendarSelect.label")}
			</InputLabel>
			<Select
				{...register("toCalendar")}
				disabled={disabled}
				error={!!errorMessage}
				onChange={onChange}
				value={value}
				required
				name='toCalendar'
				labelId='to-calendar-list-label'
				label={t("importModules.ToCalendarSelect.label")}
				margin='dense'
			>
				{calendars.map((calendar) => (
					<MenuItem value={calendar.id} key={calendar.id}>
						{calendar.summary}
					</MenuItem>
				))}
			</Select>
			<FormHelperText disabled={!!errorMessage}>{errorMessage}</FormHelperText>
		</FormControl>
	);
});

export default ToCalendarSelect;
