package com.example.webrtc;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gargoylesoftware.htmlunit.javascript.host.media.rtc.RTCSessionDescription;
import org.json.JSONObject;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
import org.springframework.web.socket.TextMessage;

import java.util.ArrayList;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Controller
public class MainController {

    // Thread-safe collections for managing users and sessions
    private final ConcurrentHashMap<String, String> users = new ConcurrentHashMap<>(); // userId -> sessionId
    private final ConcurrentHashMap<String, String> sessions = new ConcurrentHashMap<>(); // sessionId -> userId

    @Autowired
    SimpMessagingTemplate simpMessagingTemplate;


    @RequestMapping(value = "/",method =  RequestMethod.GET)
    public String Index(){
        return "index";
    }

    @MessageMapping("/testServer")
    @SendTo("/topic/testServer")
    public String testServer(String Test){
        System.out.println("Testing Server");
        return Test;
    }

    @MessageMapping("/addUser")
    public void addUser(String user, StompHeaderAccessor headerAccessor){
        String sessionId = headerAccessor.getSessionId();
        System.out.println("Adding User: " + user + " with session: " + sessionId);

        // Remove user if already exists (reconnection case)
        users.entrySet().removeIf(entry -> entry.getKey().equals(user));
        sessions.entrySet().removeIf(entry -> entry.getValue().equals(user));

        // Add new user
        users.put(user, sessionId);
        sessions.put(sessionId, user);

        System.out.println("Current users: " + users.keySet());
        System.out.println("User Added Successfully");

        // Broadcast updated user list to all connected clients
        broadcastUserList();
    }

    @MessageMapping("/removeUser")
    public void removeUser(String user){
        System.out.println("Removing User: " + user);
        String sessionId = users.remove(user);
        if (sessionId != null) {
            sessions.remove(sessionId);
        }
        System.out.println("User Removed Successfully");

        // Broadcast updated user list to all connected clients
        broadcastUserList();
    }

    @EventListener
    public void handleWebSocketDisconnectListener(SessionDisconnectEvent event) {
        StompHeaderAccessor headerAccessor = StompHeaderAccessor.wrap(event.getMessage());
        String sessionId = headerAccessor.getSessionId();
        String user = sessions.remove(sessionId);

        if (user != null) {
            users.remove(user);
            System.out.println("User disconnected: " + user + " (session: " + sessionId + ")");

            // Broadcast updated user list to all connected clients
            broadcastUserList();
        }
    }

    private void broadcastUserList() {
        try {
            ArrayList<String> userList = new ArrayList<>(users.keySet());
            ObjectMapper mapper = new ObjectMapper();
            String userListJson = mapper.writeValueAsString(userList);
            simpMessagingTemplate.convertAndSend("/topic/users", userListJson);
            System.out.println("Broadcasting user list: " + userListJson);
        } catch (JsonProcessingException e) {
            System.err.println("Error serializing user list: " + e.getMessage());
        }
    }

    @MessageMapping("/getUserList")
    public void getUserList(){
        System.out.println("Getting user list");
        broadcastUserList();
    }

    @MessageMapping("/call")
    public void Call(String call){
        JSONObject jsonObject = new JSONObject(call);
        System.out.println("Call request: " + call);
        String callTo = jsonObject.getString("callTo");
        String callFrom = jsonObject.getString("callFrom");

        // Check if it's new format with type field
        if (jsonObject.has("type")) {
            System.out.println("New format call from " + callFrom + " to " + callTo);
            simpMessagingTemplate.convertAndSendToUser(callTo, "/topic/call", call);
        } else {
            // Backward compatibility - old format
            System.out.println("Old format call from " + callFrom + " to " + callTo);
            simpMessagingTemplate.convertAndSendToUser(callTo, "/topic/call", callFrom);
        }
    }

    @MessageMapping("/callResponse")
    public void CallResponse(String response){
        JSONObject jsonObject = new JSONObject(response);
        System.out.println("Call response: " + response);
        String callTo = jsonObject.getString("callTo");
        String callFrom = jsonObject.getString("callFrom");
        String type = jsonObject.getString("type");

        System.out.println("Call " + type + " from " + callFrom + " to " + callTo);
        simpMessagingTemplate.convertAndSendToUser(callTo, "/topic/callResponse", response);
    }

    @MessageMapping("/offer")
    public void Offer(String offer){

        System.out.println("Offer Came");
        JSONObject jsonObject = new JSONObject(offer);
        System.out.println(jsonObject.get("offer"));
        System.out.println(jsonObject.get("toUser"));
        System.out.println(jsonObject.get("fromUser"));
        simpMessagingTemplate.convertAndSendToUser(jsonObject.getString("toUser"),"/topic/offer",offer);
        System.out.println("Offer Sent");
    }

    @MessageMapping("/answer")
    public void Answer(String answer){
        System.out.println("Answer came");
        System.out.println(answer);
        JSONObject jsonObject = new JSONObject(answer);
        System.out.println(jsonObject.get("toUser"));
        System.out.println(jsonObject.get("fromUser"));
        System.out.println(jsonObject.get("answer"));
        simpMessagingTemplate.convertAndSendToUser(jsonObject.getString("toUser"),"/topic/answer",answer);
        System.out.println("Answer Sent");
    }
    @MessageMapping("/candidate")
    public void Candidate(String candidate){
        System.out.println("Candidate came");
        JSONObject jsonObject = new JSONObject(candidate);
        System.out.println(jsonObject.get("toUser"));
        System.out.println(jsonObject.get("fromUser"));
        System.out.println(jsonObject.get("candidate"));
        simpMessagingTemplate.convertAndSendToUser(jsonObject.getString("toUser"),"/topic/candidate",candidate);
        System.out.println("Candidate Sent");


    }



}
