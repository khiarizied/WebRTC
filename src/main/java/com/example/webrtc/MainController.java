package com.example.webrtc;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.webrtc.entity.User;
import com.example.webrtc.service.UserService;
import org.json.JSONObject;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import jakarta.validation.Valid;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

@Controller
public class MainController {

    // Thread-safe collections for managing users and sessions
    private final ConcurrentHashMap<String, String> users = new ConcurrentHashMap<>(); // userId -> sessionId
    private final ConcurrentHashMap<String, String> sessions = new ConcurrentHashMap<>(); // sessionId -> userId

    @Autowired
    SimpMessagingTemplate simpMessagingTemplate;

    @Autowired
    private UserService userService;

    @Autowired
    private PasswordEncoder passwordEncoder;


    @RequestMapping(value = "/", method = RequestMethod.GET)
    public String index() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.isAuthenticated() && !auth.getName().equals("anonymousUser")) {
            return "redirect:/chat";
        }
        return "redirect:/login";
    }

    @GetMapping("/login")
    public String login(@RequestParam(value = "error", required = false) String error,
                       @RequestParam(value = "logout", required = false) String logout,
                       Model model) {
        if (error != null) {
            model.addAttribute("error", "Invalid username or password");
        }
        if (logout != null) {
            model.addAttribute("message", "You have been logged out successfully");
        }
        return "login";
    }

    @GetMapping("/register")
    public String register(Model model) {
        model.addAttribute("user", new User());
        return "register";
    }

    @PostMapping("/register")
    public String registerUser(@Valid @ModelAttribute("user") User user, 
                              BindingResult bindingResult, 
                              Model model) {
        if (bindingResult.hasErrors()) {
            return "register";
        }

        try {
            userService.registerUser(user.getUsername(), user.getPassword(), user.getFullName());
            model.addAttribute("success", "Registration successful! Please login.");
            return "login";
        } catch (RuntimeException e) {
            model.addAttribute("error", e.getMessage());
            return "register";
        }
    }

    @GetMapping("/chat")
    public String chat(Model model) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String username = auth.getName();

        // Set user as online
        userService.setUserOnline(username, true);

        model.addAttribute("currentUser", username);
        return "chat";
    }

    @PostMapping("/logout")
    public String logout() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && !auth.getName().equals("anonymousUser")) {
            userService.setUserOnline(auth.getName(), false);
        }
        return "redirect:/login?logout=true";
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

        // Add new user to session tracking
        users.put(user, sessionId);
        sessions.put(sessionId, user);

        // Update user online status in database
        userService.setUserOnline(user, true);

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
            // Update user online status in database
            userService.setUserOnline(user, false);
            System.out.println("User disconnected: " + user + " (session: " + sessionId + ")");

            // Broadcast updated user list to all connected clients
            broadcastUserList();
        }
    }

    private void broadcastUserList() {
        try {
            // Get online users from database
            List<User> onlineUsers = userService.getAllOnlineUsers();
            List<String> userList = onlineUsers.stream()
                    .map(User::getUsername)
                    .toList();

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
