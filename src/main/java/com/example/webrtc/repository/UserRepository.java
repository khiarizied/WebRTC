package com.example.webrtc.repository;

import com.example.webrtc.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByUsername(String username);

    boolean existsByUsername(String username);

    @Query("SELECT u FROM User u WHERE u.isOnline = true")
    List<User> findAllOnlineUsers();

    @Modifying
    @Query("UPDATE User u SET u.isOnline = :isOnline WHERE u.username = :username")
    void updateUserOnlineStatus(@Param("username") String username, @Param("isOnline") boolean isOnline);

    @Modifying
    @Query("UPDATE User u SET u.isOnline = false")
    void setAllUsersOffline();
    
}