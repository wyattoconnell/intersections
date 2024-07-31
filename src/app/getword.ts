import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class GetWord {

  constructor(
    private http:HttpClient
  ) { }

  // NOTE: update the URL when publishing to the server!  This should
  // connect to a PHP file on our actual server.  For the published
  // backend above, we would change this URL to:
  // https://cs4640.cs.virginia.edu/activities/angular/backend.php
  sendRequest(data:any):Observable<any> {
    // Send the data array as a JSON object in the BODY of the HTTP POST request
    return this.http.post("https://cs4640.cs.virginia.edu/qdy5bq/hw8/wordle_api.php",JSON.stringify(data));
  }

}