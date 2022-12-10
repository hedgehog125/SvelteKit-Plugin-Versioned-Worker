export const format = {
	time: (total, count = 3) => {
		let hours = Math.floor(total / (60 * 60));
		total -= hours * (60 * 60);
		let minutes = Math.floor(total / 60);
		total -= minutes * 60;
		let seconds = total;

		let counts = [hours, minutes, seconds];
		counts.splice(0, counts.length - count);
		return counts.map(
			value => value.toString().padStart(2, "0")
		).join(":");
	},
	shorten: (text, limit) => {
		if (text.length < limit) return text;

		return text.slice(0, limit - 3) + "...";
	}
};