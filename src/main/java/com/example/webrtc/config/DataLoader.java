package com.example.webrtc.config;

import com.example.webrtc.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

@Component
public class DataLoader implements CommandLineRunner {

    @Autowired
    private UserService userService;

    @Override
    public void run(String... args) throws Exception {
        // Create some test users
        if (!userService.existsByUsername("alice")) {
            userService.registerUser("alice", "password123", "Alice Johnson");
            System.out.println("Created test user: alice");
        }

        if (!userService.existsByUsername("bob")) {
            userService.registerUser("bob", "password123", "Bob Smith");
            System.out.println("Created test user: bob");
        }

        if (!userService.existsByUsername("admin")) {
            userService.registerUser("admin", "admin123", "Administrator");
            System.out.println("Created test user: admin");
        }

        // Set all users offline at startup
        userService.setAllUsersOffline();
        System.out.println("All users set to offline status");
    }
}