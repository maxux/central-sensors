/* w1 raspberry pi sensors logger
 * Author: Daniel Maxime (maxux.unix@gmail.com)
 *
 * gcc sensors.c -W -Wall -O2 -o sensors -lsqlite3
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston,
 * MA 02110-1301, USA.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <time.h>
#include <curl/curl.h>
#include <dirent.h>

#define SENSOR_ERROR    -1250
#define SENSOR_INVALID  -999999

char *__webpush = "http://10.241.0.254:30502/sensors";

typedef struct sensors_t {
	int count;
	char **devices;

} sensors_t;

void diep(char *str) {
	perror(str);
	exit(EXIT_FAILURE);
}

/*
 * check sensors response checksum
 * good sample: 2a 00 4b 46 ff ff 0e 10 84 : crc=84 YES
 * bad sample : ff ff ff ff ff ff ff ff ff : crc=c9 NO
 */
int sensors_checksum(char *buffer) {
	if(strstr(buffer, "YES"))
		return 1;

	return 0;
}

/*
 * extract temperature value in milli-degres celcius
 * sample: 2a 00 4b 46 ff ff 0e 10 84 t=20875
 * t= is the decimal value
 */
int sensors_value(char *buffer) {
	char *str;

	if(!(str = strstr(buffer, " t=")))
		return SENSOR_ERROR;

	return atoi(str + 3);
}

/* read sensors current value */
int sensors_read(char *device) {
	FILE *fp;
	char buffer[1024], filename[256];
	int value = 0;

	sprintf(filename, "/sys/bus/w1/devices/%s/w1_slave", device);
	if(!(fp = fopen(filename, "r"))) {
		perror(filename);
		return SENSOR_INVALID;
	}

	/* reading first line: checksum */
	if(!(fgets(buffer, sizeof(buffer), fp))) {
		perror("fgets");
		goto finish;
	}

	/* checking checksum */
	if(!sensors_checksum(buffer)) {
		fprintf(stderr, "[-] %s: invalid checksum\n", filename);
		goto finish;
	}

	/* reading temperature value */
	if(!(fgets(buffer, sizeof(buffer), fp))) {
		perror("fgets");
		goto finish;
	}

	/* extracting temperature */
	value = sensors_value(buffer);

	finish:
	fclose(fp);
	return value;
}

void sensors_push(char *baseurl, time_t timestamp, char *device, int value) {
	CURL *curl;
	char url[512];

	sprintf(url, "%s/%s/%ld/%d", baseurl, device, timestamp, value);
	printf("[+] pushing to: %s\n", url);

	curl = curl_easy_init();
	curl_easy_setopt(curl, CURLOPT_URL, url);
	curl_easy_setopt(curl, CURLOPT_HEADER, 0);
	curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 0);
	curl_easy_setopt(curl, CURLOPT_TIMEOUT, 10);
	// curl_easy_setopt(curl, CURLOPT_VERBOSE, 1);

	curl_easy_perform(curl);
	curl_easy_cleanup(curl);
}

int sensors_init(sensors_t *sensors) {
	DIR *dir;
	char *path = "/sys/bus/w1/devices/";
	struct dirent *ent = NULL;

	if(!(dir = opendir(path)))
		diep(path);

	while((ent = readdir(dir))) {
		// ignore dot and dotdot
		if(!strcmp(".", ent->d_name) || !strcmp("..", ent->d_name))
			continue;

		// ignore w1 bus directories
		if(!strncmp("w1_", ent->d_name, 3))
			continue;

		sensors->devices = realloc(sensors->devices, sizeof(char *) * (sensors->count + 1));
		sensors->devices[sensors->count] = strdup(ent->d_name);

		sensors->count += 1;
	}

	closedir(dir);

	return sensors->count;
}

int main(void) {
	time_t timestamp;
	sensors_t sensors = {
		.count = 0,
		.devices = NULL
	};

	/* using the same timestamp for each sensors */
	timestamp = time(NULL);
	sensors_init(&sensors);

	printf("[+] sensors found: %d\n", sensors.count);

	/* foreach sensors */
	for(int i = 0; i < sensors.count; i++) {
		int value = 0;

		/* reading sensor error until good value */
		while((value = sensors_read(sensors.devices[i])) == SENSOR_ERROR)
			fprintf(stderr, "[-] sensor %s: read error\n", sensors.devices[i]);

		/* checking if the sensors was well found */
		if(value == SENSOR_INVALID) {
			fprintf(stderr, "[-] sensor %s: device error\n", sensors.devices[i]);
			continue;
		}

		printf("[+] sensor %s: %d\n", sensors.devices[i], value);

		sensors_push(__webpush, timestamp, sensors.devices[i], value);
	}

	return 0;
}
